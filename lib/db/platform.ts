import { randomUUID } from 'node:crypto';
import { db, toCount } from './index.mjs';
import { hashPassword, verifyPassword } from '@/lib/password.mjs';

/**
 * RASTLA operasyon ekibinin hesapları ve yetkileri.
 *
 * **Ayrı tablo, ayrı çerez, ayrı yetki.** `operator_users` içine bir rol
 * eklenerek çözülebilirdi ama çözülmemeli: o tablodaki her satır bir
 * işletmeye bağlı ve platform çalışanı hiçbir işletmeye bağlı değil.
 * Sıkıştırılsaydı `operator_id` anlamsız bir değer taşımak zorunda kalırdı ve
 * "bu kişi hangi işletmenin personeli" sorusu cevapsız hâle gelirdi.
 */

export type PlatformRole = 'admin' | 'reviewer';

export type PlatformUser = {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  status: 'active' | 'suspended';
  createdAt: string;
  lastLoginAt: string | null;
};

type Row = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  password_hash: string;
  role: PlatformRole;
  status: 'active' | 'suspended';
  created_at: string;
  last_login_at: string | null;
};

function toUser(row: Row): PlatformUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Platform yetkileri.
 *
 * `reviewer` işletme doğrular ve ilan onaylar; **paraya dokunamaz.** Komisyon
 * oranı ve hak ediş durdurma ticari kararlar ve geri dönüşleri pahalı; ilan
 * kontrolü ise günlük ve çok sayıda yapılan bir iş. İkisini aynı role vermek,
 * her gün ilan bakan birine sözleşme değiştirme yetkisi vermek olurdu.
 */
export type PlatformCapability =
  | 'isletme.goruntule'
  | 'isletme.dogrula'
  | 'ilan.incele'
  /**
   * Acente açmak ve askıya almak.
   *
   * `admin`'e ait: acente kabul etmek ticari bir karar (kimin misafir
   * yönlendirebileceği) ve geri dönüşü, her gün yapılan ilan incelemesinden
   * daha pahalı.
   */
  | 'acente.yonet'
  | 'komisyon.belirle'
  | 'hakedis.durdur'
  | 'platform.ekip';

const REVIEWER: PlatformCapability[] = ['isletme.goruntule', 'isletme.dogrula', 'ilan.incele'];
const ADMIN: PlatformCapability[] = [
  ...REVIEWER,
  'acente.yonet',
  'komisyon.belirle',
  'hakedis.durdur',
  'platform.ekip',
];

const PLATFORM_CAPABILITIES: Record<PlatformRole, PlatformCapability[]> = {
  reviewer: REVIEWER,
  admin: ADMIN,
};

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  admin: 'Yönetici',
  reviewer: 'İnceleme',
};

export function platformRoleCan(role: PlatformRole, capability: PlatformCapability): boolean {
  return PLATFORM_CAPABILITIES[role].includes(capability);
}

export async function getPlatformUser(id: string): Promise<PlatformUser | null> {
  const row = await (await db()).get<Row>('SELECT * FROM platform_users WHERE id = ?', [id]);
  return row ? toUser(row) : null;
}

export async function listPlatformUsers(): Promise<PlatformUser[]> {
  const rows = await (await db()).all<Row>('SELECT * FROM platform_users ORDER BY name');
  return rows.map(toUser);
}

export async function countPlatformUsers(): Promise<number> {
  const row = await (await db()).get<{ n: number | string }>(
    'SELECT COUNT(*) AS n FROM platform_users'
  );
  return toCount(row?.n);
}

export async function createPlatformUser(input: {
  email: string;
  name: string;
  role: PlatformRole;
  password: string;
}): Promise<{ ok: true; user: PlatformUser } | { ok: false; reason: 'duplicate' }> {
  const id = randomUUID();

  try {
    await (
      await db()
    ).run(
      `INSERT INTO platform_users (id, email, name, password_hash, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [
        id,
        normalizeEmail(input.email),
        input.name,
        hashPassword(input.password),
        input.role,
        new Date().toISOString(),
      ]
    );
  } catch (error) {
    if (/UNIQUE|duplicate key/i.test(String(error))) return { ok: false, reason: 'duplicate' };
    throw error;
  }

  return { ok: true, user: (await getPlatformUser(id))! };
}

export type PlatformAuthResult =
  | { ok: true; user: PlatformUser }
  | { ok: false; reason: 'bad_credentials' | 'suspended' };

/**
 * E-posta ve parolayı doğrular.
 *
 * Hesap bulunamadığında da bir özet doğrulaması yapılır: aksi hâlde cevap
 * süresi, e-postanın sistemde kayıtlı olup olmadığını ele verirdi. Bu panelde
 * önemi daha da yüksek — platform hesaplarının listesi, hedefli bir saldırı
 * için doğrudan işe yarar bilgi.
 */
export async function authenticatePlatformUser(
  email: string,
  password: string
): Promise<PlatformAuthResult> {
  const row = await (
    await db()
  ).get<Row>('SELECT * FROM platform_users WHERE email = ?', [normalizeEmail(email)]);

  if (!row) {
    verifyPassword(password, dummyHash());
    return { ok: false, reason: 'bad_credentials' };
  }
  if (!verifyPassword(password, row.password_hash)) {
    return { ok: false, reason: 'bad_credentials' };
  }
  if (row.status !== 'active') return { ok: false, reason: 'suspended' };

  return { ok: true, user: toUser(row) };
}

let cachedDummy: string | null = null;
function dummyHash(): string {
  cachedDummy ??= hashPassword('rastla-zaman-dengeleyici');
  return cachedDummy;
}

export async function recordPlatformLogin(userId: string): Promise<void> {
  await (
    await db()
  ).run('UPDATE platform_users SET last_login_at = ? WHERE id = ?', [
    new Date().toISOString(),
    userId,
  ]);
}
