import { randomBytes, randomUUID } from 'node:crypto';
import { db } from './index.mjs';
import { releaseCapacity } from './slots';

export type BookingStatus = 'confirmed' | 'redeemed' | 'cancelled';

/** İptali kimin yaptığı. `weather` ayrı tutulur: müşteri kusurlu değildir. */
export type CancelReason = 'customer' | 'operator' | 'weather';

export type Booking = {
  id: string;
  code: string;
  userId: string;
  activitySlug: string;
  operatorId: string;
  /** Kapasitenin düşüldüğü slot. */
  slotId: string | null;
  /** Slottan düşen miktar; iptalde aynı miktar geri verilir. */
  units: number;
  bookingDate: string;
  bookingTime: string;
  adults: number;
  children: number;
  totalTRY: number;
  status: BookingStatus;
  createdAt: string;
  redeemedAt: string | null;
  /** Bileti onaylayan işletme personelinin hesap kimliği (operator_users.id). */
  redeemedBy: string | null;
  cancelledAt: string | null;
  cancelReason: CancelReason | null;
};

type Row = {
  id: string;
  code: string;
  user_id: string;
  activity_slug: string;
  operator_id: string;
  slot_id: string | null;
  units: number;
  booking_date: string;
  booking_time: string;
  adults: number;
  children: number;
  total_try: number;
  status: BookingStatus;
  created_at: string;
  redeemed_at: string | null;
  redeemed_by: string | null;
  cancelled_at: string | null;
  cancel_reason: CancelReason | null;
};

function toBooking(row: Row): Booking {
  return {
    id: row.id,
    code: row.code,
    userId: row.user_id,
    activitySlug: row.activity_slug,
    operatorId: row.operator_id,
    slotId: row.slot_id,
    units: row.units,
    bookingDate: row.booking_date,
    bookingTime: row.booking_time,
    adults: row.adults,
    children: row.children,
    totalTRY: row.total_try,
    status: row.status,
    createdAt: row.created_at,
    redeemedAt: row.redeemed_at,
    redeemedBy: row.redeemed_by,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
  };
}

/**
 * Bilet kodu üretir.
 *
 * 20 bayt (160 bit) kriptografik rastgelelik, Crockford Base32 ile yazılır —
 * okunaklıdır (I/L/O/U yok, elle girilirken karışmaz) ve tahmin edilemez.
 * Kodun tahmin edilemez olması, biletin sahteciliğe karşı tek savunmasıdır.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateCode(): string {
  const bytes = randomBytes(20);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  // 4'erli gruplar elle okunmayı ve telefonda söylemeyi kolaylaştırır.
  return out.match(/.{1,4}/g)!.join('-');
}

export async function createBooking(input: {
  userId: string;
  activitySlug: string;
  operatorId: string;
  slotId: string | null;
  units: number;
  bookingDate: string;
  bookingTime: string;
  adults: number;
  children: number;
  totalTRY: number;
}): Promise<Booking> {
  const row: Row = {
    id: randomUUID(),
    code: generateCode(),
    user_id: input.userId,
    activity_slug: input.activitySlug,
    operator_id: input.operatorId,
    slot_id: input.slotId,
    units: input.units,
    booking_date: input.bookingDate,
    booking_time: input.bookingTime,
    adults: input.adults,
    children: input.children,
    total_try: input.totalTRY,
    status: 'confirmed',
    created_at: new Date().toISOString(),
    redeemed_at: null,
    redeemed_by: null,
    cancelled_at: null,
    cancel_reason: null,
  };

  await (
    await db()
  ).run(
    `INSERT INTO bookings
       (id, code, user_id, activity_slug, operator_id, slot_id, units, booking_date,
        booking_time, adults, children, total_try, status, created_at, redeemed_at, redeemed_by,
        cancelled_at, cancel_reason)
     VALUES
       (@id, @code, @user_id, @activity_slug, @operator_id, @slot_id, @units, @booking_date,
        @booking_time, @adults, @children, @total_try, @status, @created_at, @redeemed_at,
        @redeemed_by, @cancelled_at, @cancel_reason)`,
    row
  );

  return toBooking(row);
}

export async function getBookingByCode(code: string): Promise<Booking | null> {
  const row = await (
    await db()
  ).get<Row>('SELECT * FROM bookings WHERE code = ?', [code.trim().toUpperCase()]);
  return row ? toBooking(row) : null;
}

export async function listBookingsForUser(userId: string): Promise<Booking[]> {
  const rows = await (
    await db()
  ).all<Row>('SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  return rows.map(toBooking);
}

export type RedeemResult =
  | { ok: true; booking: Booking }
  | {
      ok: false;
      reason: 'not_found' | 'already_redeemed' | 'cancelled' | 'wrong_operator';
      booking: Booking | null;
    };

/**
 * Bileti kullanılmış olarak işaretler. Bir bilet yalnızca BİR KEZ onaylanabilir.
 *
 * Garantinin dayandığı yer tek bir koşullu UPDATE'tir:
 *
 *   UPDATE ... SET status='redeemed' WHERE code=? AND status='confirmed'
 *
 * Bu ifade atomiktir. İki kişi aynı bileti aynı anda okutsa bile ikisinin
 * UPDATE'i sırayla çalışır; ilki satırı 'redeemed' yapar, ikincisinin WHERE
 * koşulu artık tutmaz ve 0 satır etkiler. Dolayısıyla "önce oku, sonra yaz"
 * biçimindeki bir kontrol (ki yarış durumuna açıktır) hiçbir yerde yapılmaz.
 *
 * Başarısızlığın sebebi, kullanıcıya doğru mesajı gösterebilmek için UPDATE
 * sonrasında ayrıca sorgulanır — bu sorgu kararı etkilemez, yalnızca açıklar.
 */
export async function redeemBooking(
  code: string,
  redeemedByUserId: string
): Promise<RedeemResult> {
  const normalized = code.trim().toUpperCase();

  const result = await (
    await db()
  ).run(
    `UPDATE bookings
        SET status = 'redeemed', redeemed_at = ?, redeemed_by = ?
      WHERE code = ? AND status = 'confirmed'`,
    [new Date().toISOString(), redeemedByUserId, normalized]
  );

  if (result.changes === 1) {
    return { ok: true, booking: (await getBookingByCode(normalized))! };
  }

  const existing = await getBookingByCode(normalized);
  if (!existing) return { ok: false, reason: 'not_found', booking: null };
  if (existing.status === 'redeemed') {
    return { ok: false, reason: 'already_redeemed', booking: existing };
  }
  return { ok: false, reason: 'cancelled', booking: existing };
}

/** İşletmenin belirli bir gündeki rezervasyonları. */
export async function listBookingsForOperator(
  operatorId: string,
  date: string
): Promise<Booking[]> {
  const rows = await (
    await db()
  ).all<Row>(
    `SELECT * FROM bookings
      WHERE operator_id = ? AND booking_date = ?
      ORDER BY booking_time, created_at`,
    [operatorId, date]
  );
  return rows.map(toBooking);
}

export type CancelResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: 'not_found' | 'already_redeemed' | 'already_cancelled' };

/**
 * Rezervasyonu iptal eder ve slot kapasitesini geri verir.
 *
 * İki şey aynı anda doğru olmalı: durum yalnızca bir kez 'cancelled' olmalı ve
 * kapasite yalnızca bir kez iade edilmeli. Garanti yine koşullu UPDATE'te:
 *
 *   UPDATE bookings SET status='cancelled' WHERE code=? AND status='confirmed'
 *
 * Etkilenen satır 1 değilse iade yapılmaz. Aynı iptal isteği iki kez gelse
 * (çift tıklama, tekrar gönderim) ikincisi 0 satır etkiler ve kapasite ikinci
 * kez iade edilmez — aksi hâlde slot kapasitesinin üzerine çıkardı.
 *
 * Kullanılmış (redeemed) bir bilet iptal edilemez: hizmet zaten verilmiştir.
 */
export async function cancelBooking(code: string, reason: CancelReason): Promise<CancelResult> {
  const normalized = code.trim().toUpperCase();

  const result = await (
    await db()
  ).run(
    `UPDATE bookings
        SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?
      WHERE code = ? AND status = 'confirmed'`,
    [new Date().toISOString(), reason, normalized]
  );

  if (result.changes !== 1) {
    const existing = await getBookingByCode(normalized);
    if (!existing) return { ok: false, reason: 'not_found' };
    if (existing.status === 'redeemed') return { ok: false, reason: 'already_redeemed' };
    return { ok: false, reason: 'already_cancelled' };
  }

  const booking = (await getBookingByCode(normalized))!;
  if (booking.slotId) await releaseCapacity(booking.slotId, booking.units);

  return { ok: true, booking };
}

/**
 * Bir günün tüm rezervasyonlarını iptal eder — hava koşulu senaryosu.
 * Her kayıt tek tek ve aynı korumayla iptal edilir.
 */
export async function cancelDay(
  operatorId: string,
  date: string,
  reason: CancelReason
): Promise<{ cancelled: number; skipped: number }> {
  const all = await listBookingsForOperator(operatorId, date);
  const bookings = all.filter((b) => b.status === 'confirmed');

  let cancelled = 0;
  let skipped = 0;

  for (const booking of bookings) {
    if ((await cancelBooking(booking.code, reason)).ok) cancelled++;
    else skipped++;
  }

  return { cancelled, skipped };
}
