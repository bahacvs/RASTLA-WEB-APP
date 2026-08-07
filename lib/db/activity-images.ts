import { randomUUID } from 'node:crypto';
import { db, toCount } from './index.mjs';

/**
 * Aktivite görselleri.
 *
 * Dosyanın kendisi depoda (`lib/storage/`), burada yalnızca kayıt var.
 *
 * Bir tasarım kararı: `activities.image` ve `activities.gallery` sütunları
 * duruyor ve her değişiklikte bu tablodan YENİDEN HESAPLANIYOR
 * (`syncActivity`). Alternatif, okuma sırasında birleştirmekti; katalog
 * listesi onlarca aktivite döndürdüğü için bu her listede fazladan bir sorgu
 * demek olurdu. Tek yazar var (bu dosya), dolayısıyla iki kaynağın ayrışma
 * riski yok.
 */

export type ActivityImage = {
  id: string;
  activityId: string;
  storageKey: string;
  contentType: string;
  alt: string | null;
  width: number;
  height: number;
  bytes: number;
  position: number;
  uploadedBy: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  activity_id: string;
  storage_key: string;
  content_type: string;
  alt: string | null;
  width: number;
  height: number;
  bytes: number;
  position: number;
  uploaded_by: string | null;
  created_at: string;
};

function toImage(row: Row): ActivityImage {
  return {
    id: row.id,
    activityId: row.activity_id,
    storageKey: row.storage_key,
    contentType: row.content_type,
    alt: row.alt,
    width: Number(row.width),
    height: Number(row.height),
    bytes: Number(row.bytes),
    position: Number(row.position),
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

/** Görselin bizim alan adımızdaki adresi. Blob adresi hiçbir zaman dışarı verilmez. */
export function imageUrl(id: string): string {
  return `/gorsel/${id}`;
}

export async function listImages(activityId: string): Promise<ActivityImage[]> {
  const rows = await (
    await db()
  ).all<Row>(
    'SELECT * FROM activity_images WHERE activity_id = ? ORDER BY position, created_at',
    [activityId]
  );
  return rows.map(toImage);
}

export async function getImage(id: string): Promise<ActivityImage | null> {
  const row = await (await db()).get<Row>('SELECT * FROM activity_images WHERE id = ?', [id]);
  return row ? toImage(row) : null;
}

export async function countImages(activityId: string): Promise<number> {
  const row = await (
    await db()
  ).get<{ n: number | string }>(
    'SELECT COUNT(*) AS n FROM activity_images WHERE activity_id = ?',
    [activityId]
  );
  return toCount(row?.n);
}

export async function addImage(input: {
  activityId: string;
  storageKey: string;
  contentType: string;
  alt: string | null;
  width: number;
  height: number;
  bytes: number;
  uploadedBy: string | null;
}): Promise<ActivityImage> {
  const client = await db();
  const id = randomUUID();

  // Sıra numarası mevcut en büyüğün bir fazlası. Aynı anda iki yükleme olursa
  // ikisi aynı numarayı alabilir; sonuç yalnızca sıralamanın belirsizliği
  // olur ve `ORDER BY position, created_at` bunu da çözer. Buraya kilit
  // koymak, sonucu görsellerin sırası olan bir sorun için fazla ağır olurdu.
  const last = await client.get<{ n: number | string | null }>(
    'SELECT MAX(position) AS n FROM activity_images WHERE activity_id = ?',
    [input.activityId]
  );
  const position = last?.n === null || last?.n === undefined ? 0 : Number(last.n) + 1;

  await client.run(
    `INSERT INTO activity_images
       (id, activity_id, storage_key, content_type, alt, width, height, bytes,
        position, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.activityId,
      input.storageKey,
      input.contentType,
      input.alt,
      input.width,
      input.height,
      input.bytes,
      position,
      input.uploadedBy,
      new Date().toISOString(),
    ]
  );

  return (await getImage(id))!;
}

export async function deleteImage(id: string): Promise<void> {
  await (await db()).run('DELETE FROM activity_images WHERE id = ?', [id]);
}

export async function setAlt(id: string, alt: string): Promise<void> {
  await (await db()).run('UPDATE activity_images SET alt = ? WHERE id = ?', [alt || null, id]);
}

/** Görseli listenin başına taşır — kapak görseli o olur. */
export async function makeCover(id: string, activityId: string): Promise<void> {
  const client = await db();
  await client.run(
    'UPDATE activity_images SET position = position + 1 WHERE activity_id = ?',
    [activityId]
  );
  await client.run('UPDATE activity_images SET position = 0 WHERE id = ?', [id]);
}

/**
 * `activities` tablosundaki görsel alanlarını bu tablodan yeniden üretir.
 *
 * Yüklenen görsel VARSA tohumla gelen sabit görselin yerini alır; hiç yoksa
 * eski değere dokunulmaz. Böylece henüz fotoğraf yüklememiş bir işletmenin
 * aktivitesi boş bir kutuya dönüşmez.
 */
export async function syncActivity(activityId: string): Promise<void> {
  const images = await listImages(activityId);
  if (images.length === 0) return;

  const [cover, ...rest] = images;

  await (
    await db()
  ).run('UPDATE activities SET image = ?, image_alt = ?, gallery = ? WHERE id = ?', [
    imageUrl(cover.id),
    cover.alt ?? '',
    JSON.stringify(rest.map((i) => ({ src: imageUrl(i.id), alt: i.alt ?? '' }))),
    activityId,
  ]);
}
