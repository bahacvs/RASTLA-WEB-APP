import { randomUUID } from 'node:crypto';
import { db, toCount } from './index.mjs';

export type User = {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  /** Hesap silindiyse silinme anı. Satır durur ama artık kimseye işaret etmez. */
  deletedAt: string | null;
};

type Row = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  deleted_at: string | null;
};

function toUser(row: Row): User {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

/** Telefon numarasını tek biçime indirger; aynı kişi iki kayıt oluşturmasın. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('90')) return digits;
  if (digits.startsWith('0')) return `90${digits.slice(1)}`;
  if (digits.length === 10) return `90${digits}`;
  return digits;
}

export async function findOrCreateUser(name: string, phone: string): Promise<User> {
  const normalized = normalizePhone(phone);
  const client = await db();

  const existing = await client.get<Row>('SELECT * FROM users WHERE phone = ?', [normalized]);

  if (existing) {
    // Ad, kaydın kimliği değil; kimlik telefondur. Aynı numaradan gelen yeni
    // bir rezervasyonda farklı bir ad yazılmışsa güncellenir — yoksa işletme
    // misafiri karşılarken ekranda eski adı görür. (Yazım düzeltmesi ya da
    // aynı hattan rezervasyon yapan bir aile üyesi.)
    const trimmed = name.trim();
    if (trimmed.length > 0 && trimmed !== existing.name) {
      await client.run('UPDATE users SET name = ? WHERE id = ?', [trimmed, existing.id]);
      existing.name = trimmed;
    }

    return toUser(existing);
  }

  const row: Row = {
    id: randomUUID(),
    name: name.trim(),
    phone: normalized,
    created_at: new Date().toISOString(),
    deleted_at: null,
  };

  await client.run('INSERT INTO users (id, name, phone, created_at) VALUES (?, ?, ?, ?)', [
    row.id,
    row.name,
    row.phone,
    row.created_at,
  ]);

  return toUser(row);
}

export async function getUser(id: string): Promise<User | null> {
  const row = await (await db()).get<Row>('SELECT * FROM users WHERE id = ?', [id]);
  return row ? toUser(row) : null;
}

/**
 * Silinmiş hesabın adı yerine yazılan metin.
 *
 * İşletme, geçmiş bir rezervasyonu listelediğinde bunu görür — kaydın kaybolmuş
 * olması değil, kişinin çekilmiş olması doğru bilgidir.
 */
export const DELETED_NAME = 'Silinmiş hesap';

/**
 * İşletme ekranında gösterilecek ad ve telefon.
 *
 * Silinmiş hesapta telefon alanı rastgele bir yer tutucu taşır; onu ekranda
 * telefon numarasıymış gibi göstermek yanıltıcı olurdu.
 */
export function displayContact(user: User | null): { name: string; phone: string } {
  if (!user) return { name: '—', phone: '—' };
  if (user.deletedAt) return { name: DELETED_NAME, phone: '—' };
  return { name: user.name, phone: user.phone };
}

export type DeleteResult =
  | { ok: true; anonymizedBookings: number }
  | {
      ok: false;
      reason: 'not_found' | 'already_deleted' | 'has_active_bookings';
      activeCodes?: string[];
    };

/**
 * Hesabı siler — KVKK md. 7 / md. 11.
 *
 * Satır **silinmez, anonimleştirilir.** Sebebi: rezervasyon ve bilet kayıtları
 * 10 yıllık zamanaşımı boyunca saklanmak zorunda (bkz. veri-saklama-imha
 * politikası) ve `bookings.user_id` bu satıra bağlı. Satırı silmek ya
 * rezervasyon geçmişini de silerdi ya da yetim kayıtlar bırakırdı.
 *
 * Anonimleştirmenin gerçek olması için ad ve telefon **geri döndürülemez**
 * biçimde değiştirilir. Telefon yerine rastgele bir yer tutucu yazılır:
 * numaranın kendisinden türetilmiş bir değer (ör. özeti) yazılsaydı, elinde
 * numara olan biri kaydı yeniden eşleştirebilirdi — bu anonimleştirme değil,
 * takma adlandırma olurdu.
 *
 * Aktif (gelecekteki onaylanmamış) rezervasyon varken silme reddedilir:
 * işletme misafiri kapıda karşılayamaz hâle gelirdi. Çağıran taraf isterse
 * önce iptal edip sonra siler.
 */
export async function deleteUser(
  userId: string,
  options: { force?: boolean } = {}
): Promise<DeleteResult> {
  const client = await db();

  const user = await getUser(userId);
  if (!user) return { ok: false, reason: 'not_found' };
  if (user.deletedAt) return { ok: false, reason: 'already_deleted' };

  if (!options.force) {
    const active = await client.all<{ code: string }>(
      `SELECT code FROM bookings WHERE user_id = ? AND status = 'confirmed'`,
      [userId]
    );

    if (active.length > 0) {
      return {
        ok: false,
        reason: 'has_active_bookings',
        activeCodes: active.map((b) => b.code),
      };
    }
  }

  // Tek ifade ve koşullu: `deleted_at IS NULL` sayesinde iki eşzamanlı silme
  // isteğinden yalnızca biri geçer. İkincisi 0 satır etkiler ve
  // 'already_deleted' cevabı alır.
  const result = await client.run(
    `UPDATE users
        SET name = ?, phone = ?, deleted_at = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [DELETED_NAME, `silindi-${randomUUID()}`, new Date().toISOString(), userId]
  );

  if (result.changes !== 1) return { ok: false, reason: 'already_deleted' };

  const bookings = await client.get<{ n: number | string }>(
    'SELECT COUNT(*) AS n FROM bookings WHERE user_id = ?',
    [userId]
  );

  return { ok: true, anonymizedBookings: toCount(bookings?.n) };
}

export type UserExport = {
  disaAktarmaTarihi: string;
  hesap: { ad: string; telefon: string; kayitTarihi: string };
  rezervasyonlar: unknown[];
  islemGunlugu: unknown[];
  aciklama: string;
};

/**
 * Kişinin kendisiyle ilgili tüm verisi — KVKK md. 11/b-c erişim hakkı.
 *
 * İşlem günlüğü de dahildir: orada kişinin IP adresi ve tarayıcı bilgisi var,
 * bunlar da onun kişisel verisi. Dışarıda bırakmak "tüm verilerim" iddiasını
 * yanlış kılardı.
 */
export async function exportUserData(userId: string): Promise<UserExport | null> {
  const client = await db();

  const user = await getUser(userId);
  if (!user) return null;

  const bookings = await client.all(
    `SELECT code, activity_slug, operator_id, booking_date, booking_time,
            adults, children, total_try, status, created_at,
            redeemed_at, cancelled_at, cancel_reason
       FROM bookings
      WHERE user_id = ?
      ORDER BY created_at DESC`,
    [userId]
  );

  const audit = await client.all(
    `SELECT at, action, outcome, ip, user_agent, meta
       FROM audit_log
      WHERE actor_type = 'customer' AND actor_id = ?
      ORDER BY at DESC`,
    [userId]
  );

  return {
    disaAktarmaTarihi: new Date().toISOString(),
    hesap: {
      ad: user.name,
      telefon: user.phone,
      kayitTarihi: user.createdAt,
    },
    rezervasyonlar: bookings,
    islemGunlugu: audit,
    aciklama:
      'Bu dosya, RASTLA sistemindeki kişisel verilerinizin tamamını içerir (KVKK md. 11). ' +
      'İşlem günlüğü, güvenlik amacıyla tutulan ve 12 ay sonunda silinen kayıtlardır.',
  };
}
