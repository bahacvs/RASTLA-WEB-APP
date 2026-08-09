import { randomBytes, randomUUID } from 'node:crypto';
import { db } from './index.mjs';
import { releaseCapacity } from './capacity.mjs';
import { rescheduleBooking as moveBooking } from './reschedule.mjs';

/**
 * `pending_payment` ve `expired` ödeme fazıyla eklendi.
 *
 * Eklemenin bedava gelen güvencesi şu: bilet onayı zaten
 * `WHERE code = ? AND status = 'confirmed'` koşuluna dayanıyor. Yani ödemesi
 * tamamlanmamış bir rezervasyon, tek satır ek kod yazılmadan okutulamaz.
 */
export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'redeemed'
  | 'cancelled'
  | 'expired';

/** İptali kimin yaptığı. `weather` ayrı tutulur: müşteri kusurlu değildir. */
export type CancelReason = 'customer' | 'operator' | 'weather';

// Kaynak ve ödeme biçimi lib/booking-sources.ts'te: istemci bileşenleri de
// kullanıyor ve bu modülü oradan içe aktarmak veritabanı katmanını tarayıcı
// paketine çekerdi.
export {
  BOOKING_SOURCES,
  SOURCE_LABELS,
  PAYMENT_MODE_LABELS,
  type BookingSource,
  type PaymentMode,
} from '@/lib/booking-sources';
import type { BookingSource, PaymentMode } from '@/lib/booking-sources';

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
  /** Slotun ekipman sayacından düşen araç sayısı; havuz yoksa 0. */
  equipmentUnits: number;
  source: BookingSource;
  paymentMode: PaymentMode;
  /** Manuel kaydı açan işletme personeli; RASTLA rezervasyonlarında null. */
  createdBy: string | null;
  /** Rezervasyonu açan acente; acente değilse null. */
  agencyId: string | null;
  /** Check-in'de kaç kişi geldi; okutulmadıysa null. */
  attended: number | null;
  noShowAt: string | null;
  bookingDate: string;
  bookingTime: string;
  adults: number;
  children: number;
  totalTRY: number;
  status: BookingStatus;
  createdAt: string;
  /** Mesafeli satış sözleşmesinin onaylandığı an. Ödemesiz rezervasyonda null. */
  termsAcceptedAt: string | null;
  /** Ödemenin onaylandığı an. Ödeme kapalıyken oluşturma anıyla aynıdır. */
  confirmedAt: string | null;
  /** Ödeme süresi dolduğu için düşürüldüğü an. */
  expiredAt: string | null;
  redeemedAt: string | null;
  /** Bileti onaylayan işletme personelinin hesap kimliği (operator_users.id). */
  redeemedBy: string | null;
  /** Saati değiştirildiyse ne zaman. Nereden nereye taşındığı işlem günlüğünde. */
  rescheduledAt: string | null;
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
  equipment_units: number;
  source: BookingSource;
  payment_mode: PaymentMode;
  created_by: string | null;
  agency_id: string | null;
  attended: number | null;
  no_show_at: string | null;
  booking_date: string;
  booking_time: string;
  adults: number;
  children: number;
  total_try: number;
  status: BookingStatus;
  created_at: string;
  terms_accepted_at: string | null;
  confirmed_at: string | null;
  expired_at: string | null;
  redeemed_at: string | null;
  redeemed_by: string | null;
  rescheduled_at: string | null;
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
    equipmentUnits: row.equipment_units ?? 0,
    source: row.source ?? 'rastla',
    paymentMode: row.payment_mode ?? 'online',
    createdBy: row.created_by ?? null,
    agencyId: row.agency_id ?? null,
    attended: row.attended ?? null,
    noShowAt: row.no_show_at ?? null,
    bookingDate: row.booking_date,
    bookingTime: row.booking_time,
    adults: row.adults,
    children: row.children,
    totalTRY: row.total_try,
    status: row.status,
    createdAt: row.created_at,
    termsAcceptedAt: row.terms_accepted_at,
    confirmedAt: row.confirmed_at,
    expiredAt: row.expired_at,
    redeemedAt: row.redeemed_at,
    redeemedBy: row.redeemed_by,
    rescheduledAt: row.rescheduled_at ?? null,
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
  /** Slotun ekipman sayacından düşen araç sayısı; havuz yoksa 0. */
  equipmentUnits?: number;
  /** Rezervasyon hangi kanaldan geldi. Varsayılan RASTLA pazaryeri. */
  source?: BookingSource;
  paymentMode?: PaymentMode;
  /** Manuel kaydı açan işletme personeli; RASTLA rezervasyonlarında null. */
  createdBy?: string | null;
  /** Rezervasyonu açan acente; acente değilse null. */
  agencyId?: string | null;
  bookingDate: string;
  bookingTime: string;
  adults: number;
  children: number;
  totalTRY: number;
  /**
   * Online ödeme devredeyse `pending_payment`, değilse `confirmed`.
   *
   * Varsayılan bilinçli olarak `confirmed`: ödeme sağlayıcısı yapılandırılana
   * kadar sistem eskisi gibi çalışmaya devam etmeli. Varsayılan
   * `pending_payment` olsaydı, ödeme kapalı bir kurulumda hiçbir bilet
   * geçerli olmazdı.
   */
  status?: 'pending_payment' | 'confirmed';
  /**
   * Mesafeli satış metinlerinin onaylandığı an.
   *
   * Ödeme alınıyorsa zorunlu: mevzuat, tüketicinin metinleri sipariş
   * ÖNCESİNDE onayladığının ispatlanmasını istiyor ve "kutu vardı" demek
   * yeterli değil. Ödemesiz rezervasyonda null kalır.
   */
  termsAcceptedAt?: string | null;
}): Promise<Booking> {
  const now = new Date().toISOString();
  const status = input.status ?? 'confirmed';

  const row: Row = {
    id: randomUUID(),
    code: generateCode(),
    user_id: input.userId,
    activity_slug: input.activitySlug,
    operator_id: input.operatorId,
    slot_id: input.slotId,
    units: input.units,
    equipment_units: input.equipmentUnits ?? 0,
    source: input.source ?? 'rastla',
    payment_mode: input.paymentMode ?? 'online',
    created_by: input.createdBy ?? null,
    agency_id: input.agencyId ?? null,
    attended: null,
    no_show_at: null,
    booking_date: input.bookingDate,
    booking_time: input.bookingTime,
    adults: input.adults,
    children: input.children,
    total_try: input.totalTRY,
    status,
    created_at: now,
    terms_accepted_at: input.termsAcceptedAt ?? null,
    // Ödeme kapalıyken rezervasyon doğrudan onaylı doğuyor; onay anı da o an.
    confirmed_at: status === 'confirmed' ? now : null,
    expired_at: null,
    redeemed_at: null,
    redeemed_by: null,
    rescheduled_at: null,
    cancelled_at: null,
    cancel_reason: null,
  };

  await (
    await db()
  ).run(
    `INSERT INTO bookings
       (id, code, user_id, activity_slug, operator_id, slot_id, units, equipment_units,
        source, payment_mode, created_by, agency_id, attended, no_show_at, booking_date,
        booking_time, adults, children, total_try, status, created_at, terms_accepted_at,
        confirmed_at, expired_at, redeemed_at, redeemed_by, cancelled_at, cancel_reason)
     VALUES
       (@id, @code, @user_id, @activity_slug, @operator_id, @slot_id, @units, @equipment_units,
        @source, @payment_mode, @created_by, @agency_id, @attended, @no_show_at, @booking_date,
        @booking_time, @adults, @children, @total_try, @status, @created_at, @terms_accepted_at,
        @confirmed_at, @expired_at, @redeemed_at, @redeemed_by, @cancelled_at, @cancel_reason)`,
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

/** Kimliğe göre. Ödeme akışı kodu değil kimliği taşır (kod ödeme sonrası anlam kazanır). */
export async function getBooking(id: string): Promise<Booking | null> {
  const row = await (await db()).get<Row>('SELECT * FROM bookings WHERE id = ?', [id]);
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
      reason:
        | 'not_found'
        | 'already_redeemed'
        | 'cancelled'
        | 'wrong_operator'
        | 'unpaid'
        | 'expired';
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
  redeemedByUserId: string,
  /**
   * Kaç kişi geldi. Verilmezse rezervasyondaki kişi sayısı yazılır.
   *
   * Rezervasyondan farklı olabilir (4 kişilik rezervasyona 3 kişi gelir) ve
   * uyuşmazlıkta kanıt olur. Hak edişi ETKİLEMEZ: müşteri satın aldığı yeri
   * kullanmasa da işletme o yeri boş tutmuştur.
   */
  attended?: number
): Promise<RedeemResult> {
  const normalized = code.trim().toUpperCase();

  const result = await (
    await db()
  ).run(
    `UPDATE bookings
        SET status = 'redeemed', redeemed_at = ?, redeemed_by = ?,
            attended = COALESCE(?, adults + children)
      WHERE code = ? AND status = 'confirmed'`,
    [new Date().toISOString(), redeemedByUserId, attended ?? null, normalized]
  );

  if (result.changes === 1) {
    return { ok: true, booking: (await getBookingByCode(normalized))! };
  }

  const existing = await getBookingByCode(normalized);
  if (!existing) return { ok: false, reason: 'not_found', booking: null };
  if (existing.status === 'redeemed') {
    return { ok: false, reason: 'already_redeemed', booking: existing };
  }
  // Ödemesi tamamlanmamış bilet. WHERE koşulu bunu zaten engelledi; buradaki
  // ayrım yalnızca personele doğru cümleyi gösterebilmek için.
  if (existing.status === 'pending_payment') {
    return { ok: false, reason: 'unpaid', booking: existing };
  }
  if (existing.status === 'expired') return { ok: false, reason: 'expired', booking: existing };
  return { ok: false, reason: 'cancelled', booking: existing };
}

/** İşletmenin belirli bir gündeki rezervasyonları. */
/**
 * İşletmenin belirli bir gündeki rezervasyonları.
 *
 * `branchId` verilirse yalnızca o şubenin ilanlarına ait kayıtlar döner.
 * Süzgeç SQL'de, çağıran tarafta değil: iki ekran da aynı süzmeyi yapıyor ve
 * JavaScript tarafında filtrelemek, sayfa sayaçlarının süzülmemiş listeden
 * hesaplanması gibi sessiz tutarsızlıklara kapı açardı.
 *
 * Şube kimliğinin bu işletmeye ait olduğu ÇAĞIRAN TARAFTA doğrulanmış olmalı
 * (`validBranchFilter`); burada doğrulanmıyor çünkü katılım zaten
 * `operator_id` ile sınırlı — başka bir işletmenin şubesi süzgece verilse bile
 * sonuç boş döner, sızıntı olmaz.
 */
export async function listBookingsForOperator(
  operatorId: string,
  date: string,
  branchId?: string | null
): Promise<Booking[]> {
  const client = await db();

  if (branchId) {
    const rows = await client.all<Row>(
      `SELECT b.* FROM bookings b
         JOIN activities a ON a.slug = b.activity_slug
        WHERE b.operator_id = ? AND b.booking_date = ? AND a.branch_id = ?
        ORDER BY b.booking_time, b.created_at`,
      [operatorId, date, branchId]
    );
    return rows.map(toBooking);
  }

  const rows = await client.all<Row>(
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
  if (booking.slotId) await releaseCapacity(booking.slotId, booking.units, booking.equipmentUnits);

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
): Promise<{ cancelled: Booking[]; skipped: number }> {
  const all = await listBookingsForOperator(operatorId, date);
  const bookings = all.filter((b) => b.status === 'confirmed');

  // İptal edilenler sayılmakla kalmaz, DÖNDÜRÜLÜR: çağıran taraf her biri için
  // iade başlatacak. Yalnızca sayı dönseydi, iade edilmesi gereken kayıtları
  // bulmak için aynı listeyi ikinci kez sorgulamak gerekirdi ve o sorgu artık
  // hepsini 'cancelled' göreceği için "bu iptali ben mi yaptım" ayrımı
  // kaybolurdu.
  const cancelled: Booking[] = [];
  let skipped = 0;

  for (const booking of bookings) {
    const result = await cancelBooking(booking.code, reason);
    if (result.ok) cancelled.push(result.booking);
    else skipped++;
  }

  return { cancelled, skipped };
}


/**
 * Bir acentenin açtığı rezervasyonlar.
 *
 * Acente **yalnızca kendi** kayıtlarını görüyor: süzgeç `agency_id` üzerinde
 * ve kimlik oturumdan geliyor, adresten değil. Başka bir acentenin kimliğini
 * göndermek diye bir yol yok.
 */
export async function listBookingsForAgency(agencyId: string): Promise<Booking[]> {
  const rows = await (
    await db()
  ).all<Row>(
    `SELECT * FROM bookings
      WHERE agency_id = ?
      ORDER BY booking_date DESC, booking_time DESC`,
    [agencyId]
  );
  return rows.map(toBooking);
}

export type RescheduleResult =
  | { ok: true; booking: Booking; from: { date: string; time: string } }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'not_confirmed'
        | 'same_slot'
        | 'slot_not_found'
        | 'other_activity'
        | 'closed'
        | 'full'
        | 'no_equipment'
        | 'moved';
    };

/**
 * Rezervasyonu başka bir slota taşır.
 *
 * Gövdesi `reschedule.mjs` içinde ve orada durmasının sebebi `capacity.mjs`
 * ile aynı: doğrulama betiği bu işlevi AYRI DÜĞÜM SÜREÇLERİ olarak çağırıyor
 * (on iki eşzamanlı taşıma denemesi ancak öyle sınanabilir) ve düğüm,
 * TypeScript modülünü doğrudan yükleyemiyor. Sıranın neden bu sıra olduğu ve
 * yarışın nasıl kesildiği o dosyada yazılı.
 *
 * Buradaki sarmalayıcı yalnızca satırı `Booking`e çeviriyor: çağıran taraf
 * sütun adlarıyla değil, uygulamanın geri kalanıyla aynı biçimle çalışsın.
 */
export async function rescheduleBooking(
  code: string,
  newSlotId: string
): Promise<RescheduleResult> {
  const result = await moveBooking(code, newSlotId);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, booking: toBooking(result.booking as Row), from: result.from };
}

export type NoShowResult = { ok: true } | { ok: false; reason: 'not_found' | 'not_pending' };

/**
 * Müşteri gelmedi.
 *
 * Kapasite GERİ VERİLMEZ: seans yapıldı, yer tutuldu ve işletme o yeri
 * başkasına satamadı. İade edilseydi geçmiş bir saatin doluluğu yanlış
 * görünür ve raporlar bozulurdu.
 *
 * Aynı koşullu UPDATE deseni: iki kez işaretlenemez, işaretlenmiş bilet
 * sonradan okutulamaz (status 'confirmed' olmaktan çıkar).
 */
export async function markNoShow(code: string, byUserId: string): Promise<NoShowResult> {
  const result = await (
    await db()
  ).run(
    `UPDATE bookings
        SET no_show_at = ?, attended = 0, redeemed_by = ?
      WHERE code = ? AND status = 'confirmed' AND no_show_at IS NULL`,
    [new Date().toISOString(), byUserId, code.trim().toUpperCase()]
  );

  if (result.changes === 1) return { ok: true };

  const booking = await getBookingByCode(code);
  return { ok: false, reason: booking ? 'not_pending' : 'not_found' };
}
