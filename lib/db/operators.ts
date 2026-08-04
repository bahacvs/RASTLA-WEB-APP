import { randomUUID } from 'node:crypto';
import { db } from './index';
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

export type Operator = { id: string; name: string; createdAt: string };

export type OperatorUser = {
  id: string;
  operatorId: string;
  email: string;
  name: string;
  role: OperatorRole;
  status: OperatorUserStatus;
  createdAt: string;
  lastLoginAt: string | null;
};

type OperatorRow = { id: string; name: string; created_at: string };

type UserRow = {
  id: string;
  operator_id: string;
  email: string;
  name: string;
  password_hash: string;
  role: OperatorRole;
  status: OperatorUserStatus;
  created_at: string;
  last_login_at: string | null;
};

function toOperator(row: OperatorRow): Operator {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

function toUser(row: UserRow): OperatorUser {
  return {
    id: row.id,
    operatorId: row.operator_id,
    email: row.email,
    name: row.name,
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

// ---------------------------------------------------------------- işletmeler

export function listOperators(): Operator[] {
  const rows = db().prepare('SELECT * FROM operators ORDER BY name').all() as OperatorRow[];
  return rows.map(toOperator);
}

export function getOperator(id: string): Operator | null {
  const row = db().prepare('SELECT * FROM operators WHERE id = ?').get(id) as
    | OperatorRow
    | undefined;
  return row ? toOperator(row) : null;
}

/** Kimliği çağıran belirler (slug gibi okunur bir değer); tekrar çalıştırmak güvenlidir. */
export function upsertOperator(id: string, name: string): Operator {
  db()
    .prepare(
      `INSERT INTO operators (id, name, created_at) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name`
    )
    .run(id, name, new Date().toISOString());

  return getOperator(id)!;
}

// ------------------------------------------------------------------ hesaplar

export function listOperatorUsers(operatorId: string): OperatorUser[] {
  const rows = db()
    .prepare('SELECT * FROM operator_users WHERE operator_id = ? ORDER BY role, name')
    .all(operatorId) as UserRow[];
  return rows.map(toUser);
}

export function getOperatorUser(id: string): OperatorUser | null {
  const row = db().prepare('SELECT * FROM operator_users WHERE id = ?').get(id) as
    | UserRow
    | undefined;
  return row ? toUser(row) : null;
}

export function countOperatorUsers(): number {
  const row = db().prepare('SELECT COUNT(*) AS n FROM operator_users').get() as { n: number };
  return row.n;
}

export type CreateUserResult =
  | { ok: true; user: OperatorUser }
  | { ok: false; reason: 'email_taken' | 'unknown_operator' };

export function createOperatorUser(input: {
  operatorId: string;
  email: string;
  name: string;
  password: string;
  role: OperatorRole;
}): CreateUserResult {
  if (!getOperator(input.operatorId)) return { ok: false, reason: 'unknown_operator' };

  const email = normalizeEmail(input.email);
  const id = randomUUID();

  // Benzersizliği önce SELECT ile kontrol edip sonra INSERT etmek yarış
  // durumuna açık olurdu: iki istek arasında kayıt oluşabilir. UNIQUE kısıtı
  // tek gerçek kaynak, ihlali burada yakalanıyor.
  try {
    db()
      .prepare(
        `INSERT INTO operator_users
           (id, operator_id, email, name, password_hash, role, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`
      )
      .run(
        id,
        input.operatorId,
        email,
        input.name.trim(),
        hashPassword(input.password),
        input.role,
        new Date().toISOString()
      );
  } catch (error) {
    if (String(error).includes('UNIQUE')) return { ok: false, reason: 'email_taken' };
    throw error;
  }

  return { ok: true, user: getOperatorUser(id)! };
}

export type AuthResult =
  | { ok: true; user: OperatorUser; operator: Operator }
  | { ok: false; reason: 'bad_credentials' | 'suspended' };

/**
 * E-posta ve parolayı doğrular.
 *
 * Hesap bulunamadığında da bir özet doğrulaması yapılır: aksi hâlde cevap
 * süresi, e-postanın sistemde kayıtlı olup olmadığını ele verirdi.
 */
export function authenticateOperatorUser(email: string, password: string): AuthResult {
  const row = db()
    .prepare('SELECT * FROM operator_users WHERE email = ?')
    .get(normalizeEmail(email)) as UserRow | undefined;

  if (!row) {
    verifyPassword(password, dummyHash());
    return { ok: false, reason: 'bad_credentials' };
  }

  if (!verifyPassword(password, row.password_hash)) {
    return { ok: false, reason: 'bad_credentials' };
  }

  if (row.status !== 'active') return { ok: false, reason: 'suspended' };

  return { ok: true, user: toUser(row), operator: getOperator(row.operator_id)! };
}

// Var olmayan hesapta da scrypt çalıştırmak için kullanılan sabit özet.
// İçeriği önemsiz; hiçbir parola bunu doğrulamayacak. İlk başarısız girişe
// kadar üretilmez — modül yüklenirken 100 ms harcamanın anlamı yok.
let cachedDummy: string | null = null;
function dummyHash(): string {
  cachedDummy ??= hashPassword('rastla-zaman-dengeleyici');
  return cachedDummy;
}

export function recordLogin(userId: string): void {
  db()
    .prepare('UPDATE operator_users SET last_login_at = ? WHERE id = ?')
    .run(new Date().toISOString(), userId);
}

/** Mevcut parolayı doğrular — parola değiştirmeden önce sorulur. */
export function checkPassword(userId: string, password: string): boolean {
  const row = db()
    .prepare('SELECT password_hash FROM operator_users WHERE id = ?')
    .get(userId) as { password_hash: string } | undefined;

  return row ? verifyPassword(password, row.password_hash) : false;
}

export function setPassword(userId: string, password: string): void {
  db()
    .prepare('UPDATE operator_users SET password_hash = ? WHERE id = ?')
    .run(hashPassword(password), userId);
}

/**
 * Hesabı askıya alır ya da yeniden etkinleştirir.
 *
 * İşletmenin son etkin sahibi askıya alınamaz — alınabilseydi işletme kendi
 * hesaplarını yönetemez hâle gelirdi ve dışarıdan müdahale gerekirdi. Koşul
 * sorgunun içinde: önce sayıp sonra güncellemek iki eşzamanlı isteğin son iki
 * sahibi birlikte düşürmesine izin verirdi.
 */
export function setOperatorUserStatus(
  userId: string,
  status: OperatorUserStatus
): { ok: true } | { ok: false; reason: 'not_found' | 'last_owner' } {
  const user = getOperatorUser(userId);
  if (!user) return { ok: false, reason: 'not_found' };

  if (status === 'suspended') {
    const result = db()
      .prepare(
        `UPDATE operator_users SET status = 'suspended'
          WHERE id = ?
            AND status = 'active'
            AND (
              role <> 'owner'
              OR (SELECT COUNT(*) FROM operator_users o
                   WHERE o.operator_id = operator_users.operator_id
                     AND o.role = 'owner'
                     AND o.status = 'active') > 1
            )`
      )
      .run(userId);

    if (result.changes === 0) {
      return user.status === 'suspended' ? { ok: true } : { ok: false, reason: 'last_owner' };
    }
    return { ok: true };
  }

  db().prepare(`UPDATE operator_users SET status = 'active' WHERE id = ?`).run(userId);
  return { ok: true };
}
