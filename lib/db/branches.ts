import { randomUUID } from 'node:crypto';
import { db } from './index.mjs';

/**
 * Şubeler — aynı işletmenin lokasyonları.
 *
 * "Bugün ne var?" sorusunun cevabı lokasyona göre değişiyor: Büyükçekmece'deki
 * personelin Silivri'nin rezervasyonlarını görmesi işe yaramıyor, yalnızca
 * ekranı kalabalıklaştırıyor.
 *
 * **Şube bir yetki sınırı DEĞİL, bir süzgeç.** Personel süzgeci kaldırıp
 * işletmenin tamamını görebilir; şube seçimi adreste taşınıyor ve gizli bir
 * şey değil. Gerçek bir yetki sınırı gerekiyorsa (bir şubenin verisini
 * diğerinden saklamak) o ayrı bir iştir ve rol sisteminde tanımlanmalıdır —
 * süzgeci yetki gibi göstermek, olmayan bir güvence vaat etmek olurdu.
 *
 * Hak ediş ve IBAN şube düzeyine İNMİYOR: ayrı IBAN gereken bir şube aslında
 * ayrı bir işletmedir ve üyelikle erişilmelidir (bkz. `memberships.ts`).
 */

export type Branch = {
  id: string;
  operatorId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
};

type Row = {
  id: string;
  operator_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

function toBranch(row: Row): Branch {
  return {
    id: row.id,
    operatorId: row.operator_id,
    name: row.name,
    address: row.address,
    lat: row.lat === null ? null : Number(row.lat),
    lng: row.lng === null ? null : Number(row.lng),
    createdAt: row.created_at,
  };
}

export async function listBranches(operatorId: string): Promise<Branch[]> {
  const rows = await (
    await db()
  ).all<Row>('SELECT * FROM branches WHERE operator_id = ? ORDER BY name', [operatorId]);
  return rows.map(toBranch);
}

/**
 * Şubeyi getirir — **yalnızca o işletmeye aitse.**
 *
 * İşletme kimliği parametre, isteğe bağlı bir kontrol değil: adres çubuğundan
 * gelen `?sube=` değeri başka bir işletmenin şubesini gösteriyor olabilir ve
 * "kimliği bilen görebilir" bir yetkilendirme değildir.
 */
export async function getBranch(id: string, operatorId: string): Promise<Branch | null> {
  const row = await (
    await db()
  ).get<Row>('SELECT * FROM branches WHERE id = ? AND operator_id = ?', [id, operatorId]);
  return row ? toBranch(row) : null;
}

export async function createBranch(input: {
  operatorId: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<Branch> {
  const id = randomUUID();

  await (
    await db()
  ).run(
    `INSERT INTO branches (id, operator_id, name, address, lat, lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.operatorId,
      input.name,
      input.address ?? null,
      input.lat ?? null,
      input.lng ?? null,
      new Date().toISOString(),
    ]
  );

  return (await getBranch(id, input.operatorId))!;
}

export async function updateBranch(
  id: string,
  operatorId: string,
  input: { name: string; address?: string | null; lat?: number | null; lng?: number | null }
): Promise<Branch | null> {
  await (
    await db()
  ).run(
    `UPDATE branches SET name = ?, address = ?, lat = ?, lng = ?
      WHERE id = ? AND operator_id = ?`,
    [input.name, input.address ?? null, input.lat ?? null, input.lng ?? null, id, operatorId]
  );
  return getBranch(id, operatorId);
}

/**
 * Şubeyi siler. **İlanlar silinmez**, şubesiz kalır (`ON DELETE SET NULL`).
 *
 * İlanı da silmek rezervasyonlarını götürürdü ve bir lokasyonu kapatmak,
 * orada yapılmış satışların kaydını silmek anlamına gelmez.
 */
export async function deleteBranch(id: string, operatorId: string): Promise<boolean> {
  const client = await db();

  // Sütun eski kurulumlarda yabancı anahtar kısıtı taşımıyor (bkz.
  // lib/db/index.mjs ADDED_COLUMNS), bu yüzden boşaltma AÇIKÇA yapılıyor.
  // Şemaya güvenip geçseydik, göç edilmiş bir veritabanında ilanlar silinmiş
  // bir şubeye işaret etmeye devam ederdi.
  await client.run('UPDATE activities SET branch_id = NULL WHERE branch_id = ? AND operator_id = ?', [
    id,
    operatorId,
  ]);

  const result = await client.run('DELETE FROM branches WHERE id = ? AND operator_id = ?', [
    id,
    operatorId,
  ]);
  return result.changes === 1;
}

/**
 * Adres çubuğundan gelen şube süzgecini doğrular.
 *
 * Geçersiz ya da başka bir işletmeye ait bir kimlik **sessizce yok sayılıyor**
 * ve süzgeçsiz görünüme düşülüyor. Hata sayfası göstermek, elle adres
 * değiştiren birine "böyle bir şube var ama sizin değil" demek olurdu.
 *
 * @returns doğrulanmış şube kimliği ya da null (süzgeç yok)
 */
export async function validBranchFilter(
  raw: string | undefined,
  operatorId: string
): Promise<string | null> {
  if (!raw) return null;
  const branch = await getBranch(raw, operatorId);
  return branch?.id ?? null;
}
