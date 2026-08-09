import { randomUUID } from 'node:crypto';
import { db } from './index.mjs';
import type { OperatorRole } from '@/lib/permissions';

/**
 * Bir hesabın erişebildiği işletmeler.
 *
 * İki ayrı tüzel kişilik işleten bir kişi bugün iki ayrı hesapla, iki ayrı
 * parolayla giriyor ve gün içinde çıkıp yeniden giriyor. Kimliği çoğaltmak
 * yerine erişimi genişletiyoruz: `operator_users` satırı kişinin kim olduğunu
 * ve ANA işletmesini taşımaya devam ediyor, `operator_memberships` yalnızca ek
 * erişim veriyor.
 *
 * Ana işletmeyi de üyelik tablosuna taşımak "daha temiz" görünürdü ama var
 * olan her sorguyu değiştirmeyi gerektirirdi; erişimi genişletmenin bedeli,
 * çalışan davranışın bozulma riski olmamalı.
 *
 * **ROL İŞLETME BAŞINA.** Kendi işletmesinde sahip olan biri ortağının
 * işletmesinde yalnızca saha personeli olabilir. Tek bir rol sütunu bunu ifade
 * edemezdi ve "her yerde aynı yetki" varsayımı, ortaklıkta kimsenin kabul
 * etmeyeceği bir varsayım.
 *
 * **Yetki her istekte buradan doğrulanıyor** (bkz. lib/auth.ts). Seçili
 * işletme çerezde taşınıyor ama çerez yalnızca "hangisi" diyor, "girebilir mi"
 * demiyor: üyelik silindiği anda elindeki çerez işe yaramaz hâle gelir.
 * Askıya alınan hesabın oturumunun anında düşmesiyle aynı güvence.
 */

export type Membership = {
  id: string;
  operatorUserId: string;
  operatorId: string;
  operatorName: string;
  role: OperatorRole;
  /** Ana işletme mi — `operator_users.operator_id`'den geliyorsa true. */
  primary: boolean;
};

type Row = {
  id: string;
  operator_user_id: string;
  operator_id: string;
  operator_name: string;
  role: OperatorRole;
};

/**
 * Kişinin girebildiği bütün işletmeler — ana işletme DAHİL.
 *
 * Ana işletme sorgunun içine katılıyor, çağıran tarafta eklenmiyor: iki ayrı
 * yerde birleştirilseydi biri güncellenip diğeri unutulabilirdi ve "hangi
 * işletmelere girebilirim" sorusunun iki farklı cevabı olurdu.
 *
 * Sıralama: ana işletme her zaman başta. Seçicide kişinin kendi işletmesinin
 * listenin ortasında kaybolması, en sık kullanacağı seçeneği gizlemek olurdu.
 */
export async function listMemberships(operatorUserId: string): Promise<Membership[]> {
  const client = await db();

  const primary = await client.get<{ operator_id: string; role: OperatorRole; name: string }>(
    `SELECT u.operator_id, u.role, o.name
       FROM operator_users u JOIN operators o ON o.id = u.operator_id
      WHERE u.id = ?`,
    [operatorUserId]
  );

  const rows = await client.all<Row>(
    `SELECT m.id, m.operator_user_id, m.operator_id, m.role, o.name AS operator_name
       FROM operator_memberships m JOIN operators o ON o.id = m.operator_id
      WHERE m.operator_user_id = ?
      ORDER BY o.name`,
    [operatorUserId]
  );

  const extra: Membership[] = rows
    // Ana işletme için ayrıca üyelik satırı varsa iki kez görünmemeli.
    .filter((row) => row.operator_id !== primary?.operator_id)
    .map((row) => ({
      id: row.id,
      operatorUserId: row.operator_user_id,
      operatorId: row.operator_id,
      operatorName: row.operator_name,
      role: row.role,
      primary: false,
    }));

  if (!primary) return extra;

  return [
    {
      id: `primary:${operatorUserId}`,
      operatorUserId,
      operatorId: primary.operator_id,
      operatorName: primary.name,
      role: primary.role,
      primary: true,
    },
    ...extra,
  ];
}

/**
 * Kişinin belirli bir işletmedeki rolü — erişimi yoksa null.
 *
 * Oturum çözümünün kalbi: çerezdeki işletme kimliği buradan geçmeden hiçbir
 * şey ifade etmiyor.
 */
export async function roleAt(
  operatorUserId: string,
  operatorId: string
): Promise<OperatorRole | null> {
  const client = await db();

  const primary = await client.get<{ role: OperatorRole }>(
    `SELECT role FROM operator_users WHERE id = ? AND operator_id = ? AND status = 'active'`,
    [operatorUserId, operatorId]
  );
  if (primary) return primary.role;

  // Askıya alınmış hesap hiçbir işletmeye giremez: askı kişiye ait, işletmeye
  // değil. Üyelik satırı dursa da kapı kapalı olmalı.
  const active = await client.get<{ id: string }>(
    `SELECT id FROM operator_users WHERE id = ? AND status = 'active'`,
    [operatorUserId]
  );
  if (!active) return null;

  const membership = await client.get<{ role: OperatorRole }>(
    'SELECT role FROM operator_memberships WHERE operator_user_id = ? AND operator_id = ?',
    [operatorUserId, operatorId]
  );
  return membership?.role ?? null;
}

export type GrantResult =
  | { ok: true; membership: Membership }
  | { ok: false; reason: 'user_not_found' | 'operator_not_found' | 'already_primary' };

/**
 * Bir hesaba başka bir işletmeye erişim verir.
 *
 * Aynı kişi için ikinci kez çağrılırsa rol GÜNCELLENİR, ikinci satır açılmaz —
 * `UNIQUE (operator_user_id, operator_id)` üzerinden tek ifadede. "Önce bak,
 * varsa güncelle, yoksa ekle" yazılsaydı iki eşzamanlı çağrı arasında ikisi de
 * "yok" görebilirdi.
 */
export async function grantMembership(input: {
  operatorUserId: string;
  operatorId: string;
  role: OperatorRole;
  grantedBy?: string | null;
}): Promise<GrantResult> {
  const client = await db();

  const user = await client.get<{ operator_id: string }>(
    'SELECT operator_id FROM operator_users WHERE id = ?',
    [input.operatorUserId]
  );
  if (!user) return { ok: false, reason: 'user_not_found' };

  // Ana işletmeye ayrıca üyelik vermek anlamsız ve zararlı olurdu: iki farklı
  // rol kaydı çıkar ve hangisinin geçerli olduğu belirsizleşirdi.
  if (user.operator_id === input.operatorId) return { ok: false, reason: 'already_primary' };

  const operator = await client.get<{ id: string }>('SELECT id FROM operators WHERE id = ?', [
    input.operatorId,
  ]);
  if (!operator) return { ok: false, reason: 'operator_not_found' };

  await client.run(
    `INSERT INTO operator_memberships (id, operator_user_id, operator_id, role, created_at, granted_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (operator_user_id, operator_id) DO UPDATE SET role = excluded.role`,
    [
      randomUUID(),
      input.operatorUserId,
      input.operatorId,
      input.role,
      new Date().toISOString(),
      input.grantedBy ?? null,
    ]
  );

  const memberships = await listMemberships(input.operatorUserId);
  return { ok: true, membership: memberships.find((m) => m.operatorId === input.operatorId)! };
}

/** Erişimi kaldırır. Ana işletme buradan kaldırılamaz — orada satır yok. */
export async function revokeMembership(
  operatorUserId: string,
  operatorId: string
): Promise<boolean> {
  const result = await (
    await db()
  ).run('DELETE FROM operator_memberships WHERE operator_user_id = ? AND operator_id = ?', [
    operatorUserId,
    operatorId,
  ]);
  return result.changes === 1;
}

/** Bir işletmeye dışarıdan erişimi olan hesaplar — ekip ekranında listelenir. */
export async function listGuestAccess(operatorId: string): Promise<
  { operatorUserId: string; name: string; email: string; role: OperatorRole }[]
> {
  const rows = await (
    await db()
  ).all<{ operator_user_id: string; name: string; email: string; role: OperatorRole }>(
    `SELECT m.operator_user_id, u.name, u.email, m.role
       FROM operator_memberships m JOIN operator_users u ON u.id = m.operator_user_id
      WHERE m.operator_id = ?
      ORDER BY u.name`,
    [operatorId]
  );

  return rows.map((row) => ({
    operatorUserId: row.operator_user_id,
    name: row.name,
    email: row.email,
    role: row.role,
  }));
}
