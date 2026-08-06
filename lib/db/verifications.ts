import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { db } from './index.mjs';

/**
 * Telefon doğrulama kodları.
 *
 * Kod veritabanında **düz metin tutulmaz**. Sebep parola özetiyle aynı değil:
 * burada mesele çevrimdışı kırma değil (kod 6 haneli, 5 dakika yaşıyor), bir
 * veritabanı sızıntısının o an bekleyen doğrulamaları da ele vermemesi.
 *
 * Doğrulamanın tek kullanımlık olması, bilet onayındaki desenin aynısıyla
 * güvenceye alınır: karar tek bir koşullu UPDATE'te verilir.
 */

export type VerificationPurpose = 'booking' | 'operator_login';

/** Kodun yaşam süresi. Kısa olması gerekiyor; SMS gecikmesi için 5 dakika yeterli. */
const TTL_SECONDS = 5 * 60;

/**
 * Bir koda izin verilen yanlış deneme sayısı.
 *
 * 6 hane = 1.000.000 olasılık. 5 denemeyle bir kodu tahmin etme şansı
 * 1/200.000; ayrıca hız sınırı kod ÜRETİMİNİ de kısıtladığı için saldırgan
 * sürekli yeni kod isteyip deneme havuzunu büyütemez.
 */
const MAX_ATTEMPTS = 5;

type Row = {
  id: string;
  phone: string;
  code_hash: string;
  purpose: VerificationPurpose;
  operator_user_id: string | null;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
  created_at: string;
};

/** `sha256$<tuz>$<özet>` — tuz her kod için ayrı. */
function hashCode(code: string, salt: string): string {
  return `sha256$${salt}$${createHash('sha256').update(`${salt}:${code}`).digest('base64url')}`;
}

function verifyCode(code: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'sha256') return false;

  const expected = Buffer.from(stored);
  const actual = Buffer.from(hashCode(code, parts[1]));

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * 6 haneli kod.
 *
 * `randomInt` kriptografik kaynak kullanır ve aralığı önyargısız böler;
 * `Math.random()` tahmin edilebilir olurdu.
 */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export type Issued = { id: string; code: string; expiresAt: string };

/**
 * Yeni bir kod üretir ve saklar.
 *
 * Aynı numara ve amaç için bekleyen eski kodlar **iptal edilir**: aksi hâlde
 * arka arkaya beş kod isteyen biri, beş ayrı koddan herhangi biriyle
 * doğrulanabilirdi ve deneme sınırı beş kat gevşemiş olurdu.
 */
export async function issueCode(input: {
  phone: string;
  purpose: VerificationPurpose;
  operatorUserId?: string | null;
}): Promise<Issued> {
  const client = await db();
  const now = new Date();

  await client.run(
    `UPDATE phone_verifications SET consumed_at = ?
      WHERE phone = ? AND purpose = ? AND consumed_at IS NULL`,
    [now.toISOString(), input.phone, input.purpose]
  );

  const code = generateCode();
  const id = randomBytes(16).toString('base64url');
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000).toISOString();

  await client.run(
    `INSERT INTO phone_verifications
       (id, phone, code_hash, purpose, operator_user_id, expires_at, attempts, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      id,
      input.phone,
      hashCode(code, randomBytes(9).toString('base64url')),
      input.purpose,
      input.operatorUserId ?? null,
      expiresAt,
      now.toISOString(),
    ]
  );

  return { id, code, expiresAt };
}

export type CheckResult =
  | { ok: true; operatorUserId: string | null }
  | { ok: false; reason: 'not_found' | 'expired' | 'too_many_attempts' | 'wrong_code' };

/**
 * Kodu doğrular ve tüketir.
 *
 * Doğru kod girildiğinde tüketim tek bir koşullu UPDATE ile yapılır:
 *
 *   UPDATE … SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL
 *
 * Aynı kodu iki istek aynı anda gönderse bile yalnızca biri geçer. "Önce
 * bak, sonra tüket" yazılsaydı bir kod iki kez kullanılabilirdi — bilet
 * onayındaki sorunun aynısı.
 *
 * Yanlış kodda deneme sayacı **koşulsuz** artar; sınırı aşınca kod yakılır.
 */
export async function checkCode(input: {
  phone: string;
  purpose: VerificationPurpose;
  code: string;
}): Promise<CheckResult> {
  const client = await db();
  const now = new Date().toISOString();

  const row = await client.get<Row>(
    `SELECT * FROM phone_verifications
      WHERE phone = ? AND purpose = ? AND consumed_at IS NULL
      ORDER BY created_at DESC`,
    [input.phone, input.purpose]
  );

  if (!row) return { ok: false, reason: 'not_found' };
  if (row.expires_at <= now) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };

  if (!verifyCode(input.code, row.code_hash)) {
    const next = row.attempts + 1;

    // Sınıra ulaşıldıysa kod aynı ifadede yakılır: ayrı bir UPDATE olsaydı
    // ikisi arasında bir deneme daha sızabilirdi.
    await client.run(
      `UPDATE phone_verifications
          SET attempts = attempts + 1,
              consumed_at = CASE WHEN attempts + 1 >= ? THEN ? ELSE consumed_at END
        WHERE id = ?`,
      [MAX_ATTEMPTS, now, row.id]
    );

    return { ok: false, reason: next >= MAX_ATTEMPTS ? 'too_many_attempts' : 'wrong_code' };
  }

  const consumed = await client.run(
    'UPDATE phone_verifications SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL',
    [now, row.id]
  );

  // 0 satır: aynı kod başka bir istek tarafından bu arada tüketildi.
  if (consumed.changes !== 1) return { ok: false, reason: 'not_found' };

  return { ok: true, operatorUserId: row.operator_user_id };
}

/** Süresi dolmuş ve tüketilmiş kayıtların temizliği — `saklama` işi çağırır. */
export async function purgeVerifications(olderThanHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
  const result = await (await db()).run('DELETE FROM phone_verifications WHERE created_at < ?', [
    cutoff,
  ]);
  return result.changes;
}

export const VERIFICATION_TTL_SECONDS = TTL_SECONDS;
export const VERIFICATION_MAX_ATTEMPTS = MAX_ATTEMPTS;
