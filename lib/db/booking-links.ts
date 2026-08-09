import { randomBytes, randomUUID } from 'node:crypto';
import { db } from './index.mjs';
import type { BookingSource } from '@/lib/booking-sources';

/**
 * İşletmenin kendi kanalları için paylaşılabilir rezervasyon linki.
 *
 * Ürünün asıl vaadi "bütün kanallarınız tek takvimde" ama işletmenin KENDİ
 * kanalından gelen müşteriyi sisteme sokacak bir yol yoktu: elle kayıt açmak
 * gerekiyordu ve kimse her telefon için panel açmıyor. Sonuç, düzeltmeye
 * çalıştığımız şeyin ta kendisiydi — RASTLA'da boş görünen dolu saat.
 *
 * Link kanal başına açılıyor ("Instagram bio", "İskele tabelası") çünkü
 * işletmenin sorduğu soru "kaç rezervasyon geldi" değil, **"hangi kanaldan"**.
 */

export type BookingLink = {
  id: string;
  code: string;
  activityId: string;
  operatorId: string;
  label: string;
  source: BookingSource;
  /** Bu linkten gelen rezervasyon sayısı. Tıklama değil, satış. */
  bookings: number;
  createdAt: string;
  disabledAt: string | null;
};

type Row = {
  id: string;
  code: string;
  activity_id: string;
  operator_id: string;
  label: string;
  source: BookingSource;
  bookings: number | string;
  created_at: string;
  disabled_at: string | null;
};

function toLink(row: Row): BookingLink {
  return {
    id: row.id,
    code: row.code,
    activityId: row.activity_id,
    operatorId: row.operator_id,
    label: row.label,
    source: row.source,
    bookings: Number(row.bookings ?? 0),
    createdAt: row.created_at,
    disabledAt: row.disabled_at,
  };
}

/**
 * Link kodları için alfabe — bilet kodundakinin aynısı.
 *
 * I/L/O/U yok: kod telefonda söyleniyor ve tabelaya basılıyor; 1 ile I,
 * 0 ile O karışırsa müşteri yanlış adrese gider.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * 8 karakter = 32^8 ≈ 1.1 × 10^12 olasılık.
 *
 * Kısa olması gerekiyor (tabelaya basılıyor, elle yazılıyor) ama TAHMİN
 * EDİLEMEZ de olmalı: tahmin edilebilse biri başka bir işletmenin linkini
 * bulup rezervasyonlarını kendi kanalına yazdırabilirdi. Sayaç ya da slug
 * kullanmak tam olarak bunu yapardı.
 */
export function generateLinkCode(): string {
  let out = '';
  for (const byte of randomBytes(8)) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export async function listLinks(activityId: string): Promise<BookingLink[]> {
  const rows = await (
    await db()
  ).all<Row>('SELECT * FROM booking_links WHERE activity_id = ? ORDER BY created_at', [activityId]);
  return rows.map(toLink);
}

export async function listLinksForOperator(operatorId: string): Promise<BookingLink[]> {
  const rows = await (
    await db()
  ).all<Row>('SELECT * FROM booking_links WHERE operator_id = ? ORDER BY created_at', [operatorId]);
  return rows.map(toLink);
}

/** Koda göre link — **kapatılmış linkler dönmez.** */
export async function getActiveLink(code: string): Promise<BookingLink | null> {
  const row = await (
    await db()
  ).get<Row>('SELECT * FROM booking_links WHERE code = ? AND disabled_at IS NULL', [
    code.trim().toUpperCase(),
  ]);
  return row ? toLink(row) : null;
}

export async function createLink(input: {
  activityId: string;
  operatorId: string;
  label: string;
  source: BookingSource;
}): Promise<BookingLink> {
  const id = randomUUID();
  const code = generateLinkCode();

  await (
    await db()
  ).run(
    `INSERT INTO booking_links (id, code, activity_id, operator_id, label, source, bookings, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [id, code, input.activityId, input.operatorId, input.label, input.source, new Date().toISOString()]
  );

  return (await getActiveLink(code))!;
}

/**
 * Linki kapatır ya da yeniden açar. **Silmiyor.**
 *
 * Silinseydi geçmiş rezervasyonların hangi kanaldan geldiği bilgisi de
 * giderdi; oysa "geçen yaz Instagram'dan kaç satış geldi" sorusu tam olarak
 * o bilgiyle cevaplanıyor.
 */
export async function setLinkDisabled(
  id: string,
  operatorId: string,
  disabled: boolean
): Promise<boolean> {
  const result = await (
    await db()
  ).run('UPDATE booking_links SET disabled_at = ? WHERE id = ? AND operator_id = ?', [
    disabled ? new Date().toISOString() : null,
    id,
    operatorId,
  ]);
  return result.changes === 1;
}

/**
 * Bu linkten bir rezervasyon geldiğini işler.
 *
 * Tek ifadede artırılıyor, okunup yazılmıyor: aynı linkten aynı anda gelen iki
 * rezervasyon sayacı bir kez artırırdı ve işletmenin "hangi kanal işe yarıyor"
 * kararı eksik sayıya dayanırdı.
 */
export async function countLinkBooking(id: string): Promise<void> {
  await (await db()).run('UPDATE booking_links SET bookings = bookings + 1 WHERE id = ?', [id]);
}

/**
 * Rezervasyonun kaynağını link kodundan çözer.
 *
 * Kaynak İSTEMCİDEN GELEN bir etikete göre değil, veritabanındaki link
 * satırına göre belirleniyor. Formdaki gizli alana `source` yazılsaydı, onu
 * değiştiren biri rezervasyonunu istediği kanala yazdırabilirdi — bugün
 * yalnızca istatistiği bozardı, kanal bazlı komisyon geldiğinde parayı.
 *
 * Link BAŞKA bir aktiviteye aitse yok sayılıyor: kod doğru olsa da o linkin
 * bu ilanla ilgisi yok.
 */
export async function resolveLink(
  code: string | undefined,
  activityId: string
): Promise<BookingLink | null> {
  if (!code) return null;
  const link = await getActiveLink(code);
  return link && link.activityId === activityId ? link : null;
}
