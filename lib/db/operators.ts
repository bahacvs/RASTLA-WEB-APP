import { randomUUID } from 'node:crypto';
import { db, toCount } from './index.mjs';
import { hashPassword, verifyPassword } from '@/lib/password.mjs';

/**
 * İşletmeler ve işletme personelinin hesapları.
 *
 * Önceden işletmeler `lib/operators.ts` içinde sabit bir diziydi ve giriş
 * işletme başına paylaşılan tek bir koddu. Kişi bazında hesaba geçilmesinin
 * sebebi denetim: bilet onayı geri alınamaz bir işlemdir ve bir ihlalde
 * "kim yaptı" sorusunun cevaplanabilmesi gerekir.
 */

export type OperatorRole = 'owner' | 'staff';
export type OperatorUserStatus = 'active' | 'suspended';

/** iyzico'nun tanıdığı alt üye işyeri türleri. */
export type LegalType = 'personal' | 'private' | 'limited';

export type Operator = {
  id: string;
  name: string;
  createdAt: string;
  /**
   * Sağlayıcıdaki alt üye işyeri anahtarı.
   *
   * NULL ise bu işletmenin aktiviteleri **online ödemeye kapalıdır**: para
   * tahsil edilip aktarılamayacak bir yere toplanmamalı.
   */
  submerchantKey: string | null;
  /** RASTLA'nın payı, on binde. 1000 = %10. */
  commissionBp: number;
};

/** Alt üye işyeri başvurusu için gereken ticari bilgiler. */
export type OperatorPaymentProfile = {
  legalType: LegalType | null;
  legalName: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  identityNumber: string | null;
  iban: string | null;
  legalAddress: string | null;
  contactEmail: string | null;
};

export type OperatorUser = {
  id: string;
  operatorId: string;
  email: string;
  name: string;
  /** İkinci faktörün gideceği numara. Eski hesaplarda null olabilir. */
  phone: string | null;
  role: OperatorRole;
  status: OperatorUserStatus;
  createdAt: string;
  lastLoginAt: string | null;
};

type OperatorRow = {
  id: string;
  name: string;
  created_at: string;
  submerchant_key: string | null;
  commission_bp: number | string | null;
  legal_type: LegalType | null;
  legal_name: string | null;
  tax_number: string | null;
  tax_office: string | null;
  identity_number: string | null;
  iban: string | null;
  legal_address: string | null;
  contact_email: string | null;
};

type UserRow = {
  id: string;
  operator_id: string;
  email: string;
  name: string;
  phone: string | null;
  password_hash: string;
  role: OperatorRole;
  status: OperatorUserStatus;
  created_at: string;
  last_login_at: string | null;
};

function toOperator(row: OperatorRow): Operator {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    submerchantKey: row.submerchant_key ?? null,
    // Sütun sonradan eklendi; eski satırlarda NULL gelebilir.
    commissionBp: Number(row.commission_bp ?? 1000),
  };
}

function toUser(row: UserRow): OperatorUser {
  return {
    id: row.id,
    operatorId: row.operator_id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

/** E-postayı tek biçime indirger; aynı kişi iki hesap açamasın. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Benzersizlik ihlali mi?
 *
 * İki motor farklı mesaj verir: SQLite "UNIQUE constraint failed", Postgres
 * "duplicate key value violates unique constraint" (SQLSTATE 23505). Yalnızca
 * birine bakılsaydı diğer motorda kopya e-posta beklenmedik bir hataya
 * dönüşürdü.
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if ((error as { code?: string }).code === '23505') return true;
  }
  const message = String(error);
  return message.includes('UNIQUE') || message.includes('duplicate key');
}

// ---------------------------------------------------------------- işletmeler

export async function listOperators(): Promise<Operator[]> {
  const rows = await (await db()).all<OperatorRow>('SELECT * FROM operators ORDER BY name');
  return rows.map(toOperator);
}

export async function getOperator(id: string): Promise<Operator | null> {
  const row = await (await db()).get<OperatorRow>('SELECT * FROM operators WHERE id = ?', [id]);
  return row ? toOperator(row) : null;
}

/** Kimliği çağıran belirler (slug gibi okunur bir değer); tekrar çalıştırmak güvenlidir. */
export async function upsertOperator(id: string, name: string): Promise<Operator> {
  await (
    await db()
  ).run(
    `INSERT INTO operators (id, name, created_at) VALUES (?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
    [id, name, new Date().toISOString()]
  );

  return (await getOperator(id))!;
}

// ------------------------------------------------------- pazaryeri / ödeme

/**
 * Alt üye işyeri başvurusunda kullanılacak ticari bilgiler.
 *
 * Ayrı bir okuyucu var çünkü bunlar `Operator` içinde taşınmamalı: vergi
 * numarası, TCKN ve IBAN her sayfa oluşturmada belleğe gelen bir nesnenin
 * içinde dolaşmamalı. Yalnızca ödeme ayarları ekranı ve başvuru çağrısı okur.
 */
export async function getPaymentProfile(
  operatorId: string
): Promise<OperatorPaymentProfile | null> {
  const row = await (
    await db()
  ).get<OperatorRow>(
    `SELECT legal_type, legal_name, tax_number, tax_office, identity_number,
            iban, legal_address, contact_email
       FROM operators WHERE id = ?`,
    [operatorId]
  );
  if (!row) return null;

  return {
    legalType: row.legal_type ?? null,
    legalName: row.legal_name ?? null,
    taxNumber: row.tax_number ?? null,
    taxOffice: row.tax_office ?? null,
    identityNumber: row.identity_number ?? null,
    iban: row.iban ?? null,
    legalAddress: row.legal_address ?? null,
    contactEmail: row.contact_email ?? null,
  };
}

export async function setPaymentProfile(
  operatorId: string,
  profile: OperatorPaymentProfile
): Promise<void> {
  await (
    await db()
  ).run(
    `UPDATE operators
        SET legal_type = ?, legal_name = ?, tax_number = ?, tax_office = ?,
            identity_number = ?, iban = ?, legal_address = ?, contact_email = ?
      WHERE id = ?`,
    [
      profile.legalType,
      profile.legalName,
      profile.taxNumber,
      profile.taxOffice,
      profile.identityNumber,
      profile.iban,
      profile.legalAddress,
      profile.contactEmail,
      operatorId,
    ]
  );
}

/**
 * Sağlayıcıdan dönen alt üye anahtarını saklar.
 *
 * Koşul `submerchant_key IS NULL`: iki eşzamanlı başvuru olursa ikincisi
 * mevcut anahtarın üzerine yazmaz. Üzerine yazsaydı, ilk anahtarla başlamış
 * ödemelerin parası artık takip edilmeyen bir üye işyerine giderdi.
 * Dönen değer, anahtarın gerçekten bu çağrıyla yazılıp yazılmadığıdır.
 */
export async function setSubmerchantKey(operatorId: string, key: string): Promise<boolean> {
  const result = await (
    await db()
  ).run(
    `UPDATE operators SET submerchant_key = ? WHERE id = ? AND submerchant_key IS NULL`,
    [key, operatorId]
  );
  return result.changes === 1;
}

// ------------------------------------------------------------------ hesaplar

export async function listOperatorUsers(operatorId: string): Promise<OperatorUser[]> {
  const rows = await (
    await db()
  ).all<UserRow>('SELECT * FROM operator_users WHERE operator_id = ? ORDER BY role, name', [
    operatorId,
  ]);
  return rows.map(toUser);
}

export async function getOperatorUser(id: string): Promise<OperatorUser | null> {
  const row = await (await db()).get<UserRow>('SELECT * FROM operator_users WHERE id = ?', [id]);
  return row ? toUser(row) : null;
}

export async function countOperatorUsers(): Promise<number> {
  const row = await (
    await db()
  ).get<{ n: number | string }>('SELECT COUNT(*) AS n FROM operator_users');
  return toCount(row?.n);
}

export type CreateUserResult =
  | { ok: true; user: OperatorUser }
  | { ok: false; reason: 'email_taken' | 'unknown_operator' };

export async function createOperatorUser(input: {
  operatorId: string;
  email: string;
  name: string;
  phone?: string | null;
  password: string;
  role: OperatorRole;
}): Promise<CreateUserResult> {
  if (!(await getOperator(input.operatorId))) return { ok: false, reason: 'unknown_operator' };

  const email = normalizeEmail(input.email);
  const id = randomUUID();

  // Benzersizliği önce SELECT ile kontrol edip sonra INSERT etmek yarış
  // durumuna açık olurdu: iki istek arasında kayıt oluşabilir. UNIQUE kısıtı
  // tek gerçek kaynak, ihlali burada yakalanıyor.
  try {
    await (
      await db()
    ).run(
      `INSERT INTO operator_users
         (id, operator_id, email, name, phone, password_hash, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        id,
        input.operatorId,
        email,
        input.name.trim(),
        input.phone ?? null,
        hashPassword(input.password),
        input.role,
        new Date().toISOString(),
      ]
    );
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'email_taken' };
    throw error;
  }

  return { ok: true, user: (await getOperatorUser(id))! };
}

export type AuthResult =
  | { ok: true; user: OperatorUser; operator: Operator }
  | {
      ok: false;
      reason: 'bad_credentials' | 'suspended';
      /**
       * E-posta gerçek bir hesaba aitse o hesabın işletmesi. Başarısız giriş
       * denemesini doğru işletmenin günlüğüne yazmak için gerekir — aksi hâlde
       * her işletme başkasına yapılan denemeleri de görürdü. Kullanıcıya
       * DÖNDÜRÜLMEZ; yalnızca sunucu tarafında kullanılır.
       */
      matchedOperatorId: string | null;
    };

/**
 * E-posta ve parolayı doğrular.
 *
 * Hesap bulunamadığında da bir özet doğrulaması yapılır: aksi hâlde cevap
 * süresi, e-postanın sistemde kayıtlı olup olmadığını ele verirdi.
 */
export async function authenticateOperatorUser(
  email: string,
  password: string
): Promise<AuthResult> {
  const row = await (
    await db()
  ).get<UserRow>('SELECT * FROM operator_users WHERE email = ?', [normalizeEmail(email)]);

  if (!row) {
    verifyPassword(password, dummyHash());
    return { ok: false, reason: 'bad_credentials', matchedOperatorId: null };
  }

  if (!verifyPassword(password, row.password_hash)) {
    return { ok: false, reason: 'bad_credentials', matchedOperatorId: row.operator_id };
  }

  if (row.status !== 'active') {
    return { ok: false, reason: 'suspended', matchedOperatorId: row.operator_id };
  }

  return { ok: true, user: toUser(row), operator: (await getOperator(row.operator_id))! };
}

// Var olmayan hesapta da scrypt çalıştırmak için kullanılan sabit özet.
// İçeriği önemsiz; hiçbir parola bunu doğrulamayacak. İlk başarısız girişe
// kadar üretilmez — modül yüklenirken 100 ms harcamanın anlamı yok.
let cachedDummy: string | null = null;
function dummyHash(): string {
  cachedDummy ??= hashPassword('rastla-zaman-dengeleyici');
  return cachedDummy;
}

export async function recordLogin(userId: string): Promise<void> {
  await (
    await db()
  ).run('UPDATE operator_users SET last_login_at = ? WHERE id = ?', [
    new Date().toISOString(),
    userId,
  ]);
}

/** Mevcut parolayı doğrular — parola değiştirmeden önce sorulur. */
export async function checkPassword(userId: string, password: string): Promise<boolean> {
  const row = await (
    await db()
  ).get<{ password_hash: string }>('SELECT password_hash FROM operator_users WHERE id = ?', [
    userId,
  ]);

  return row ? verifyPassword(password, row.password_hash) : false;
}

/** İkinci faktörün gideceği numarayı ayarlar. */
export async function setOperatorUserPhone(userId: string, phone: string): Promise<void> {
  await (await db()).run('UPDATE operator_users SET phone = ? WHERE id = ?', [phone, userId]);
}

export async function setPassword(userId: string, password: string): Promise<void> {
  await (
    await db()
  ).run('UPDATE operator_users SET password_hash = ? WHERE id = ?', [
    hashPassword(password),
    userId,
  ]);
}

/**
 * Hesabı askıya alır ya da yeniden etkinleştirir.
 *
 * İşletmenin son etkin sahibi askıya alınamaz — alınabilseydi işletme kendi
 * hesaplarını yönetemez hâle gelirdi ve dışarıdan müdahale gerekirdi. Koşul
 * sorgunun içinde: önce sayıp sonra güncellemek iki eşzamanlı isteğin son iki
 * sahibi birlikte düşürmesine izin verirdi.
 */
export async function setOperatorUserStatus(
  userId: string,
  status: OperatorUserStatus
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'last_owner' }> {
  const client = await db();

  const user = await getOperatorUser(userId);
  if (!user) return { ok: false, reason: 'not_found' };

  if (status === 'suspended') {
    const result = await client.run(
      `UPDATE operator_users SET status = 'suspended'
        WHERE id = ?
          AND status = 'active'
          AND (
            role <> 'owner'
            OR (SELECT COUNT(*) FROM operator_users o
                 WHERE o.operator_id = operator_users.operator_id
                   AND o.role = 'owner'
                   AND o.status = 'active') > 1
          )`,
      [userId]
    );

    if (result.changes === 0) {
      return user.status === 'suspended' ? { ok: true } : { ok: false, reason: 'last_owner' };
    }
    return { ok: true };
  }

  await client.run(`UPDATE operator_users SET status = 'active' WHERE id = ?`, [userId]);
  return { ok: true };
}
