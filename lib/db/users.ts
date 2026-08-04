import { randomUUID } from 'node:crypto';
import { db } from './index';

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

export function findOrCreateUser(name: string, phone: string): User {
  const normalized = normalizePhone(phone);

  const existing = db().prepare('SELECT * FROM users WHERE phone = ?').get(normalized) as
    | Row
    | undefined;

  if (existing) {
    // Ad, kaydın kimliği değil; kimlik telefondur. Aynı numaradan gelen yeni
    // bir rezervasyonda farklı bir ad yazılmışsa güncellenir — yoksa işletme
    // misafiri karşılarken ekranda eski adı görür. (Yazım düzeltmesi ya da
    // aynı hattan rezervasyon yapan bir aile üyesi.)
    const name_ = name.trim();
    if (name_.length > 0 && name_ !== existing.name) {
      db().prepare('UPDATE users SET name = ? WHERE id = ?').run(name_, existing.id);
      existing.name = name_;
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

  db()
    .prepare(
      'INSERT INTO users (id, name, phone, created_at) VALUES (@id, @name, @phone, @created_at)'
    )
    .run({ id: row.id, name: row.name, phone: row.phone, created_at: row.created_at });

  return toUser(row);
}

export function getUser(id: string): User | null {
  const row = db().prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
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
  | { ok: false; reason: 'not_found' | 'already_deleted' | 'has_active_bookings'; activeCodes?: string[] };

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
export function deleteUser(userId: string, options: { force?: boolean } = {}): DeleteResult {
  const user = getUser(userId);
  if (!user) return { ok: false, reason: 'not_found' };
  if (user.deletedAt) return { ok: false, reason: 'already_deleted' };

  if (!options.force) {
    const active = db()
      .prepare(`SELECT code FROM bookings WHERE user_id = ? AND status = 'confirmed'`)
      .all(userId) as { code: string }[];

    if (active.length > 0) {
      return {
        ok: false,
        reason: 'has_active_bookings',
        activeCodes: active.map((b) => b.code),
      };
    }
  }

  const now = new Date().toISOString();

  // Tek ifade ve koşullu: `deleted_at IS NULL` sayesinde iki eşzamanlı silme
  // isteğinden yalnızca biri geçer. İkincisi 0 satır etkiler ve
  // 'already_deleted' cevabı alır.
  const result = db()
    .prepare(
      `UPDATE users
          SET name = ?, phone = ?, deleted_at = ?
        WHERE id = ? AND deleted_at IS NULL`
    )
    .run(DELETED_NAME, `silindi-${randomUUID()}`, now, userId);

  if (result.changes !== 1) return { ok: false, reason: 'already_deleted' };

  const bookings = db()
    .prepare('SELECT COUNT(*) AS n FROM bookings WHERE user_id = ?')
    .get(userId) as { n: number };

  return { ok: true, anonymizedBookings: bookings.n };
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
export function exportUserData(userId: string): UserExport | null {
  const user = getUser(userId);
  if (!user) return null;

  const bookings = db()
    .prepare(
      `SELECT b.code, b.activity_slug, b.operator_id, b.booking_date, b.booking_time,
              b.adults, b.children, b.total_try, b.status, b.created_at,
              b.redeemed_at, b.cancelled_at, b.cancel_reason
         FROM bookings b
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC`
    )
    .all(userId);

  const audit = db()
    .prepare(
      `SELECT at, action, outcome, ip, user_agent, meta
         FROM audit_log
        WHERE actor_type = 'customer' AND actor_id = ?
        ORDER BY at DESC`
    )
    .all(userId);

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
