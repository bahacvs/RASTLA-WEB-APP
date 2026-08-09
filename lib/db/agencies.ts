import { randomUUID } from 'node:crypto';
import { db, toCount } from './index.mjs';
import { hashPassword, verifyPassword } from '@/lib/password.mjs';

/**
 * Acenteler ve acente personelinin hesapları.
 *
 * Otel, tur şirketi, konsiyerj — RASTLA'ya misafir yönlendiren aracılar.
 * Çoğunda teknik ekip yok, dolayısıyla makine API'si bu turun kapsamı dışında;
 * onun yerine resepsiyon görevlisinin kullanacağı bir portal var.
 *
 * **Ayrı tablo, ayrı çerez, ayrı yetki** — `platform_users` ile aynı gerekçe
 * (bkz. lib/db/platform.ts). `operator_users` içine bir rol eklenerek
 * çözülebilirdi ama o tablodaki her satır bir işletmeye bağlı ve acente
 * personeli hiçbir işletmeye bağlı değil; sıkıştırılsaydı `operator_id`
 * anlamsız bir değer taşımak zorunda kalırdı.
 *
 * Rol AYRIMI YOK ve bu bilinçli: acente personelinin yapabileceği tek şey
 * misafir adına yer tutmak ve kendi tuttuğu yeri iptal etmek. İkiye bölecek
 * bir yetki olmadan rol tanımlamak, kullanılmayan bir soyutlama olurdu.
 */

export type AgencyStatus = 'active' | 'suspended';

export type Agency = {
  id: string;
  name: string;
  contactEmail: string | null;
  phone: string | null;
  status: AgencyStatus;
  createdAt: string;
};

export type AgencyUser = {
  id: string;
  agencyId: string;
  email: string;
  name: string;
  status: AgencyStatus;
  createdAt: string;
  lastLoginAt: string | null;
};

type AgencyRow = {
  id: string;
  name: string;
  contact_email: string | null;
  phone: string | null;
  status: AgencyStatus;
  created_at: string;
};

type UserRow = {
  id: string;
  agency_id: string;
  email: string;
  name: string;
  password_hash: string;
  status: AgencyStatus;
  created_at: string;
  last_login_at: string | null;
};

function toAgency(row: AgencyRow): Agency {
  return {
    id: row.id,
    name: row.name,
    contactEmail: row.contact_email,
    phone: row.phone,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toUser(row: UserRow): AgencyUser {
  return {
    id: row.id,
    agencyId: row.agency_id,
    email: row.email,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export function normalizeAgencyEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ------------------------------------------------------------------ acente

export async function getAgency(id: string): Promise<Agency | null> {
  const row = await (await db()).get<AgencyRow>('SELECT * FROM agencies WHERE id = ?', [id]);
  return row ? toAgency(row) : null;
}

export async function listAgencies(): Promise<Agency[]> {
  const rows = await (await db()).all<AgencyRow>('SELECT * FROM agencies ORDER BY name');
  return rows.map(toAgency);
}

export async function createAgency(input: {
  name: string;
  contactEmail?: string | null;
  phone?: string | null;
}): Promise<Agency> {
  const id = randomUUID();

  await (
    await db()
  ).run(
    `INSERT INTO agencies (id, name, contact_email, phone, status, created_at)
     VALUES (?, ?, ?, ?, 'active', ?)`,
    [id, input.name, input.contactEmail ?? null, input.phone ?? null, new Date().toISOString()]
  );

  return (await getAgency(id))!;
}

/**
 * Acenteyi askıya alır ya da geri açar.
 *
 * Askı ACENTEYE ait, personele değil: bir otelle çalışmayı bırakmak, o otelin
 * her hesabını tek tek kapatmayı gerektirmemeli. Personelin oturumu her
 * istekte acentenin durumunu da soruyor (bkz. lib/agency-auth.ts), bu yüzden
 * askı anında etkili.
 */
export async function setAgencyStatus(id: string, status: AgencyStatus): Promise<boolean> {
  const result = await (
    await db()
  ).run('UPDATE agencies SET status = ? WHERE id = ?', [status, id]);
  return result.changes === 1;
}

// ------------------------------------------------------------------ hesap

export async function getAgencyUser(id: string): Promise<AgencyUser | null> {
  const row = await (await db()).get<UserRow>('SELECT * FROM agency_users WHERE id = ?', [id]);
  return row ? toUser(row) : null;
}

export async function listAgencyUsers(agencyId: string): Promise<AgencyUser[]> {
  const rows = await (
    await db()
  ).all<UserRow>('SELECT * FROM agency_users WHERE agency_id = ? ORDER BY name', [agencyId]);
  return rows.map(toUser);
}

export async function countAgencyUsers(): Promise<number> {
  const row = await (
    await db()
  ).get<{ n: number | string }>('SELECT COUNT(*) AS n FROM agency_users');
  return toCount(row?.n);
}

export async function createAgencyUser(input: {
  agencyId: string;
  email: string;
  name: string;
  password: string;
}): Promise<{ ok: true; user: AgencyUser } | { ok: false; reason: 'duplicate' | 'no_agency' }> {
  const agency = await getAgency(input.agencyId);
  if (!agency) return { ok: false, reason: 'no_agency' };

  const id = randomUUID();

  try {
    await (
      await db()
    ).run(
      `INSERT INTO agency_users (id, agency_id, email, name, password_hash, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [
        id,
        input.agencyId,
        normalizeAgencyEmail(input.email),
        input.name,
        hashPassword(input.password),
        new Date().toISOString(),
      ]
    );
  } catch (error) {
    if (/UNIQUE|duplicate key/i.test(String(error))) return { ok: false, reason: 'duplicate' };
    throw error;
  }

  return { ok: true, user: (await getAgencyUser(id))! };
}

export type AgencyAuthResult =
  | { ok: true; user: AgencyUser; agency: Agency }
  | { ok: false; reason: 'bad_credentials' | 'suspended' };

/**
 * E-posta ve parolayı doğrular.
 *
 * Hesap bulunamadığında da bir özet doğrulaması yapılıyor: aksi hâlde cevap
 * süresi, e-postanın sistemde kayıtlı olup olmadığını ele verirdi.
 *
 * Askıya alınmış ACENTE ile askıya alınmış HESAP aynı sonucu veriyor: ikisi de
 * "giremezsiniz" demek ve hangisinin askıda olduğunu söylemek, karşı tarafa
 * işine yaramayacak bir ayrıntı vermek olurdu.
 */
export async function authenticateAgencyUser(
  email: string,
  password: string
): Promise<AgencyAuthResult> {
  const row = await (
    await db()
  ).get<UserRow>('SELECT * FROM agency_users WHERE email = ?', [normalizeAgencyEmail(email)]);

  if (!row) {
    verifyPassword(password, dummyHash());
    return { ok: false, reason: 'bad_credentials' };
  }
  if (!verifyPassword(password, row.password_hash)) {
    return { ok: false, reason: 'bad_credentials' };
  }
  if (row.status !== 'active') return { ok: false, reason: 'suspended' };

  const agency = await getAgency(row.agency_id);
  if (!agency || agency.status !== 'active') return { ok: false, reason: 'suspended' };

  return { ok: true, user: toUser(row), agency };
}

let cachedDummy: string | null = null;
function dummyHash(): string {
  cachedDummy ??= hashPassword('rastla-zaman-dengeleyici');
  return cachedDummy;
}

export async function recordAgencyLogin(userId: string): Promise<void> {
  await (
    await db()
  ).run('UPDATE agency_users SET last_login_at = ? WHERE id = ?', [
    new Date().toISOString(),
    userId,
  ]);
}

export async function setAgencyUserStatus(id: string, status: AgencyStatus): Promise<boolean> {
  const result = await (
    await db()
  ).run('UPDATE agency_users SET status = ? WHERE id = ?', [status, id]);
  return result.changes === 1;
}
