import { randomUUID } from 'node:crypto';
import { db, toCount } from './index.mjs';

/**
 * Hak ediş defteri.
 *
 * Ödeme ile hak ediş bilinçli olarak ayrı: ödeme "müşteri parayı verdi mi",
 * hak ediş "bu paranın ne kadarı ne zaman işletmenin oldu". Aradaki fark,
 * ödemesi alınmış ama hizmeti verilmemiş bir rezervasyonda ortaya çıkıyor —
 * o para henüz kimsenin değil, sağlayıcıda bloke.
 *
 * Dosyanın tamamı projenin değişmez deseni üzerine kurulu: **karar tek bir
 * koşullu SQL ifadesinde verilir.** Burada bedeli en yüksek olan yer serbest
 * bırakma: iki kasiyer aynı bileti aynı anda okutursa hak ediş iki kez
 * doğmamalı, sağlayıcıya iki onay çağrısı gitmemeli.
 */

export type PayoutStatus = 'held' | 'released' | 'reversed';

export type Payout = {
  id: string;
  bookingId: string;
  paymentId: string;
  operatorId: string;
  grossTRY: number;
  commissionTRY: number;
  refundedTRY: number;
  netTRY: number;
  status: PayoutStatus;
  providerRef: string | null;
  failureReason: string | null;
  heldAt: string;
  releasedAt: string | null;
  reversedAt: string | null;
};

type Row = {
  id: string;
  booking_id: string;
  payment_id: string;
  operator_id: string;
  gross_try: number;
  commission_try: number;
  refunded_try: number;
  net_try: number;
  status: PayoutStatus;
  provider_ref: string | null;
  failure_reason: string | null;
  held_at: string;
  released_at: string | null;
  reversed_at: string | null;
};

function toPayout(row: Row): Payout {
  return {
    id: row.id,
    bookingId: row.booking_id,
    paymentId: row.payment_id,
    operatorId: row.operator_id,
    grossTRY: Number(row.gross_try),
    commissionTRY: Number(row.commission_try),
    refundedTRY: Number(row.refunded_try),
    netTRY: Number(row.net_try),
    status: row.status,
    providerRef: row.provider_ref,
    failureReason: row.failure_reason,
    heldAt: row.held_at,
    releasedAt: row.released_at,
    reversedAt: row.reversed_at,
  };
}

export type HoldResult = { ok: true; payoutId: string } | { ok: false; reason: 'duplicate' };

/**
 * Ödeme onaylanınca hak edişi bloke olarak açar.
 *
 * Tekrar çağrılması zararsız: `payouts.booking_id` UNIQUE olduğu için ikinci
 * kayıt veritabanı tarafından reddedilir. Kontrolün burada değil şemada
 * olmasının sebebi yarış: sağlayıcının geri çağrısı ile tarayıcının dönüşü
 * aynı anda gelebiliyor ve "önce bak, yoksa ekle" yazılsaydı ikisi de
 * "yok" görüp ikisi de ekleyebilirdi.
 */
export async function holdPayout(input: {
  bookingId: string;
  paymentId: string;
  operatorId: string;
  grossTRY: number;
  commissionTRY: number;
  providerRef: string | null;
}): Promise<HoldResult> {
  const id = randomUUID();
  const net = input.grossTRY - input.commissionTRY;

  try {
    await (
      await db()
    ).run(
      `INSERT INTO payouts
         (id, booking_id, payment_id, operator_id, gross_try, commission_try,
          refunded_try, net_try, status, provider_ref, held_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'held', ?, ?)`,
      [
        id,
        input.bookingId,
        input.paymentId,
        input.operatorId,
        input.grossTRY,
        input.commissionTRY,
        net,
        input.providerRef,
        new Date().toISOString(),
      ]
    );
  } catch (error) {
    const message = String(error);
    if (message.includes('UNIQUE') || message.includes('duplicate key')) {
      return { ok: false, reason: 'duplicate' };
    }
    throw error;
  }

  return { ok: true, payoutId: id };
}

export type ClaimResult =
  | { ok: true; payout: Payout }
  | { ok: false; reason: 'not_found' | 'not_held' };

/**
 * Serbest bırakmayı ÜSTLENİR — bu turun en kritik ifadesi.
 *
 * `WHERE booking_id = ? AND status = 'held'` koşulu, eşzamanlı çağrılardan tam
 * olarak birinin 1 satır etkilemesini garanti ediyor. Sağlayıcıya onay
 * çağrısını yalnızca kazanan yapar; diğerleri `not_held` alır ve hiçbir yan
 * etki üretmez.
 *
 * Sağlayıcı çağrısı ÖNCE yapılıp sonra yazılsaydı, iki süreç de çağrıyı
 * gönderir ve pay iki kez serbest bırakılmaya çalışılırdı.
 */
export async function claimRelease(bookingId: string): Promise<ClaimResult> {
  const result = await (
    await db()
  ).run(
    `UPDATE payouts SET status = 'released', released_at = ?
      WHERE booking_id = ? AND status = 'held'`,
    [new Date().toISOString(), bookingId]
  );

  if (result.changes === 1) return { ok: true, payout: (await getPayout(bookingId))! };

  const existing = await getPayout(bookingId);
  return { ok: false, reason: existing ? 'not_held' : 'not_found' };
}

/**
 * Payı geri çevirmeyi üstlenir — müşteri gelmedi ya da iade edildi.
 *
 * Aynı koşullu desen. Serbest bırakılmış bir hak ediş geri çevrilemez: hizmet
 * verilmiş ve para işletmenin olmuştur; geri alınacaksa yolu iadedir.
 */
export async function claimReversal(bookingId: string): Promise<ClaimResult> {
  const result = await (
    await db()
  ).run(
    `UPDATE payouts SET status = 'reversed', reversed_at = ?, net_try = 0
      WHERE booking_id = ? AND status = 'held'`,
    [new Date().toISOString(), bookingId]
  );

  if (result.changes === 1) return { ok: true, payout: (await getPayout(bookingId))! };

  const existing = await getPayout(bookingId);
  return { ok: false, reason: existing ? 'not_held' : 'not_found' };
}

/**
 * Sağlayıcı çağrısının sonucunu kaydeder.
 *
 * Başarısızlık defterdeki durumu GERİ ALMAZ. "İşletme bunu hak etti" bizim
 * kararımız; sağlayıcıya iletmek tekrarlanabilir bir teslim adımı. Geri
 * alınsaydı, ağ hatası yüzünden hizmeti verilmiş bir rezervasyon yeniden
 * "bekliyor" görünür ve ikinci kez okutulmaya çalışılırdı.
 */
export async function recordProviderOutcome(
  bookingId: string,
  outcome: { ok: true } | { ok: false; error: string }
): Promise<void> {
  await (
    await db()
  ).run('UPDATE payouts SET failure_reason = ? WHERE booking_id = ?', [
    outcome.ok ? null : outcome.error.slice(0, 300),
    bookingId,
  ]);
}

/**
 * İade edilen tutarı deftere işler.
 *
 * Net tutar aynı ifadede yeniden hesaplanıyor: ayrı bir okuma-yazma turu
 * yapılsaydı, aynı anda işlenen ikinci bir iade birinciyi ezebilirdi.
 */
export async function recordRefund(bookingId: string, refundedTRY: number): Promise<void> {
  await (
    await db()
  ).run(
    `UPDATE payouts
        SET refunded_try = refunded_try + ?,
            net_try = CASE
              WHEN gross_try - commission_try - (refunded_try + ?) > 0
              THEN gross_try - commission_try - (refunded_try + ?)
              ELSE 0
            END
      WHERE booking_id = ?`,
    [refundedTRY, refundedTRY, refundedTRY, bookingId]
  );
}

export async function getPayout(bookingId: string): Promise<Payout | null> {
  const row = await (
    await db()
  ).get<Row>('SELECT * FROM payouts WHERE booking_id = ?', [bookingId]);
  return row ? toPayout(row) : null;
}

export type PayoutSummary = {
  heldTRY: number;
  releasedTRY: number;
  reversedTRY: number;
  commissionTRY: number;
  refundedTRY: number;
  count: number;
};

/** İşletmenin bakiye özeti. */
export async function payoutSummary(operatorId: string): Promise<PayoutSummary> {
  const row = await (
    await db()
  ).get<Record<string, number | string | null>>(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'held' THEN net_try ELSE 0 END), 0)     AS held,
       COALESCE(SUM(CASE WHEN status = 'released' THEN net_try ELSE 0 END), 0) AS released,
       COALESCE(SUM(CASE WHEN status = 'reversed' THEN gross_try - commission_try ELSE 0 END), 0) AS reversed,
       COALESCE(SUM(commission_try), 0) AS commission,
       COALESCE(SUM(refunded_try), 0)   AS refunded,
       COUNT(*) AS n
     FROM payouts WHERE operator_id = ?`,
    [operatorId]
  );

  return {
    heldTRY: toCount(row?.held),
    releasedTRY: toCount(row?.released),
    reversedTRY: toCount(row?.reversed),
    commissionTRY: toCount(row?.commission),
    refundedTRY: toCount(row?.refunded),
    count: toCount(row?.n),
  };
}

export type PayoutLine = Payout & {
  bookingCode: string;
  bookingDate: string;
  bookingTime: string;
  activitySlug: string;
};

/**
 * Mutabakat satırları — rezervasyon bilgisiyle birlikte.
 *
 * Tek sorguda birleştiriliyor: satır başına ayrı bir rezervasyon sorgusu,
 * yoğun bir ayda ekranı ve CSV'yi kullanılamaz hâle getirirdi.
 */
export async function listPayouts(
  operatorId: string,
  options: { from?: string; to?: string; limit?: number } = {}
): Promise<PayoutLine[]> {
  const params: (string | number)[] = [operatorId];
  let where = 'p.operator_id = ?';

  if (options.from) {
    where += ' AND b.booking_date >= ?';
    params.push(options.from);
  }
  if (options.to) {
    where += ' AND b.booking_date <= ?';
    params.push(options.to);
  }

  const rows = await (
    await db()
  ).all<Row & { code: string; booking_date: string; booking_time: string; activity_slug: string }>(
    `SELECT p.*, b.code, b.booking_date, b.booking_time, b.activity_slug
       FROM payouts p JOIN bookings b ON b.id = p.booking_id
      WHERE ${where}
      ORDER BY b.booking_date DESC, b.booking_time DESC
      LIMIT ${Number(options.limit ?? 500)}`,
    params
  );

  return rows.map((row) => ({
    ...toPayout(row),
    bookingCode: row.code,
    bookingDate: row.booking_date,
    bookingTime: row.booking_time,
    activitySlug: row.activity_slug,
  }));
}
