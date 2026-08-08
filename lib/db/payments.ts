import { randomUUID } from 'node:crypto';
import { db, toCount } from './index.mjs';

/**
 * Ödeme kayıtları ve rezervasyonun ödeme durumu.
 *
 * Bu dosyanın tamamı tek bir desen üzerine kurulu: **karar tek bir koşullu
 * SQL ifadesinde verilir.** Ödemede bunun bedeli en yüksek, çünkü yanlış
 * yapıldığında ya müşteriden iki kez para alınır ya da ödenmemiş bir bilet
 * geçerli sayılır.
 */

export type PaymentStatus = 'initiated' | 'succeeded' | 'failed' | 'refunded';

export type Payment = {
  id: string;
  bookingId: string;
  provider: string;
  providerRef: string | null;
  conversationId: string;
  token: string | null;
  amountTRY: number;
  commissionTRY: number;
  currency: string;
  status: PaymentStatus;
  itemTransactionRef: string | null;
  cardFamily: string | null;
  cardLastFour: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  booking_id: string;
  provider: string;
  provider_ref: string | null;
  conversation_id: string;
  token: string | null;
  amount_try: number;
  commission_try: number;
  currency: string;
  status: PaymentStatus;
  item_transaction_ref: string | null;
  card_family: string | null;
  card_last_four: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

function toPayment(row: Row): Payment {
  return {
    id: row.id,
    bookingId: row.booking_id,
    provider: row.provider,
    providerRef: row.provider_ref,
    conversationId: row.conversation_id,
    token: row.token,
    amountTRY: row.amount_try,
    commissionTRY: row.commission_try,
    currency: row.currency,
    status: row.status,
    itemTransactionRef: row.item_transaction_ref,
    cardFamily: row.card_family,
    cardLastFour: row.card_last_four,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createPayment(input: {
  bookingId: string;
  provider: string;
  conversationId: string;
  amountTRY: number;
  commissionTRY: number;
}): Promise<Payment> {
  const now = new Date().toISOString();
  const id = randomUUID();

  await (
    await db()
  ).run(
    `INSERT INTO payments
       (id, booking_id, provider, conversation_id, amount_try, commission_try,
        currency, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'TRY', 'initiated', ?, ?)`,
    [
      id,
      input.bookingId,
      input.provider,
      input.conversationId,
      input.amountTRY,
      input.commissionTRY,
      now,
      now,
    ]
  );

  return (await getPayment(id))!;
}

export async function getPayment(id: string): Promise<Payment | null> {
  const row = await (await db()).get<Row>('SELECT * FROM payments WHERE id = ?', [id]);
  return row ? toPayment(row) : null;
}

export async function getPaymentByToken(token: string): Promise<Payment | null> {
  const row = await (await db()).get<Row>('SELECT * FROM payments WHERE token = ?', [token]);
  return row ? toPayment(row) : null;
}

export async function getPaymentByConversation(conversationId: string): Promise<Payment | null> {
  const row = await (
    await db()
  ).get<Row>('SELECT * FROM payments WHERE conversation_id = ?', [conversationId]);
  return row ? toPayment(row) : null;
}

/** Rezervasyonun başarılı ödemesi (iade için gerekir). */
export async function getSucceededPayment(bookingId: string): Promise<Payment | null> {
  const row = await (
    await db()
  ).get<Row>(
    `SELECT * FROM payments WHERE booking_id = ? AND status IN ('succeeded', 'refunded')
      ORDER BY created_at DESC`,
    [bookingId]
  );
  return row ? toPayment(row) : null;
}

export async function attachToken(paymentId: string, token: string): Promise<void> {
  await (
    await db()
  ).run('UPDATE payments SET token = ?, updated_at = ? WHERE id = ?', [
    token,
    new Date().toISOString(),
    paymentId,
  ]);
}

export type SettleResult =
  | { ok: true; alreadySettled: boolean }
  | { ok: false; reason: 'not_found' | 'already_failed' };

/**
 * Ödemeyi başarılı olarak işaretler.
 *
 * Koşul `status = 'initiated'`: aynı geri çağrı iki kez gelse de (webhook +
 * tarayıcı dönüşü, ya da sağlayıcının tekrar denemesi) yalnızca biri geçer.
 * İkincisi `alreadySettled` alır ve hiçbir yan etki üretmez.
 */
export async function markPaymentSucceeded(input: {
  paymentId: string;
  providerRef: string;
  cardFamily?: string;
  cardLastFour?: string;
  /**
   * Sağlayıcının kalem işlem kimliği. Hak edişi serbest bırakmanın anahtarı;
   * ödeme kimliğiyle onay çağrısı YAPILAMAZ, bu yüzden ayrı saklanıyor.
   */
  itemTransactionRef?: string;
}): Promise<SettleResult> {
  const result = await (
    await db()
  ).run(
    `UPDATE payments
        SET status = 'succeeded', provider_ref = ?, card_family = ?, card_last_four = ?,
            item_transaction_ref = ?, updated_at = ?
      WHERE id = ? AND status = 'initiated'`,
    [
      input.providerRef,
      input.cardFamily ?? null,
      input.cardLastFour ?? null,
      input.itemTransactionRef ?? null,
      new Date().toISOString(),
      input.paymentId,
    ]
  );

  if (result.changes === 1) return { ok: true, alreadySettled: false };

  const existing = await getPayment(input.paymentId);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.status === 'failed') return { ok: false, reason: 'already_failed' };

  return { ok: true, alreadySettled: true };
}

export async function markPaymentFailed(paymentId: string, reason: string): Promise<void> {
  await (
    await db()
  ).run(
    `UPDATE payments SET status = 'failed', failure_reason = ?, updated_at = ?
      WHERE id = ? AND status = 'initiated'`,
    [reason.slice(0, 300), new Date().toISOString(), paymentId]
  );
}

// ------------------------------------------------------- rezervasyon durumu

export type ConfirmResult =
  | { ok: true; alreadyConfirmed: boolean }
  | { ok: false; reason: 'not_pending' };

/**
 * Ödemesi alınan rezervasyonu onaylar.
 *
 * **Bu fazın en kritik ifadesi.** Koşul `status = 'pending_payment'` olduğu
 * için, sağlayıcının geri çağrısı ile tarayıcının dönüşü aynı anda gelse de,
 * webhook iki kez tetiklense de, rezervasyon tam olarak bir kez onaylanır.
 * "Önce oku, onaylanmış mı bak, sonra yaz" yazılsaydı iki istek arasında
 * ikisi de 'pending' görüp ikisi de onaylardı.
 */
export async function confirmBookingPayment(bookingId: string): Promise<ConfirmResult> {
  const result = await (
    await db()
  ).run(
    `UPDATE bookings SET status = 'confirmed', confirmed_at = ?
      WHERE id = ? AND status = 'pending_payment'`,
    [new Date().toISOString(), bookingId]
  );

  if (result.changes === 1) return { ok: true, alreadyConfirmed: false };

  const row = await (
    await db()
  ).get<{ status: string }>('SELECT status FROM bookings WHERE id = ?', [bookingId]);

  // Zaten onaylıysa bu bir tekrar; hata değil.
  if (row?.status === 'confirmed' || row?.status === 'redeemed') {
    return { ok: true, alreadyConfirmed: true };
  }
  return { ok: false, reason: 'not_pending' };
}

/**
 * Ödeme süresi dolan rezervasyonun düşürülmesi.
 *
 * Gövdesi `expiry.mjs` içinde: aynı ifadeyi zamanlanmış `odeme-suresi` işi de
 * çağırıyor ve o iş düz düğüm betiği olarak çalıştığında TypeScript modülünü
 * yükleyemez. Tek gerçek uygulama orada; burası yalnızca kapıyı açıyor.
 */
export { expireBooking } from './expiry.mjs';

// ------------------------------------------------------------------ iadeler

export type RefundReason = 'customer' | 'operator' | 'weather';

export type RecordRefundResult =
  | { ok: true; refundId: string }
  | { ok: false; reason: 'duplicate' };

/**
 * İade kaydını açar.
 *
 * `UNIQUE (payment_id, reason)` sayesinde aynı ödeme aynı sebeple iki kez
 * iade edilemez: çift tıklama ya da tekrarlanan bir geri çağrı, parayı iki
 * kez geri göndermemeli. Kontrol veritabanında; "önce bak, sonra ekle"
 * yapılsaydı iki eşzamanlı istek arasından ikisi de geçebilirdi.
 */
export async function beginRefund(input: {
  paymentId: string;
  amountTRY: number;
  reason: RefundReason;
}): Promise<RecordRefundResult> {
  const id = randomUUID();

  try {
    await (
      await db()
    ).run(
      `INSERT INTO refunds (id, payment_id, amount_try, reason, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [id, input.paymentId, input.amountTRY, input.reason, new Date().toISOString()]
    );
  } catch (error) {
    const message = String(error);
    if (message.includes('UNIQUE') || message.includes('duplicate key')) {
      return { ok: false, reason: 'duplicate' };
    }
    throw error;
  }

  return { ok: true, refundId: id };
}

export async function completeRefund(
  refundId: string,
  outcome: { ok: true; providerRef: string } | { ok: false; error: string }
): Promise<void> {
  const client = await db();

  if (outcome.ok) {
    await client.run(
      `UPDATE refunds SET status = 'succeeded', provider_ref = ? WHERE id = ?`,
      [outcome.providerRef, refundId]
    );
    await client.run(
      `UPDATE payments SET status = 'refunded', updated_at = ?
        WHERE id = (SELECT payment_id FROM refunds WHERE id = ?)`,
      [new Date().toISOString(), refundId]
    );
    return;
  }

  await client.run(`UPDATE refunds SET status = 'failed', failure_reason = ? WHERE id = ?`, [
    outcome.error.slice(0, 300),
    refundId,
  ]);
}

export async function countRefunds(paymentId: string): Promise<number> {
  const row = await (
    await db()
  ).get<{ n: number | string }>(
    `SELECT COUNT(*) AS n FROM refunds WHERE payment_id = ? AND status <> 'failed'`,
    [paymentId]
  );
  return toCount(row?.n);
}
