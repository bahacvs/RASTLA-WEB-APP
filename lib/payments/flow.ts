import { getBooking, type Booking } from '@/lib/db/bookings';
import { getOperator } from '@/lib/db/operators';
import { record } from '@/lib/db/audit';
import type { RequestContext } from '@/lib/request-context';
import { SITE_URL } from '@/lib/site';
import {
  attachToken,
  beginRefund,
  completeRefund,
  confirmBookingPayment,
  createPayment,
  getPaymentByToken,
  getSucceededPayment,
  markPaymentFailed,
  markPaymentSucceeded,
  type RefundReason,
} from '@/lib/db/payments';
import { paymentProvider, splitAmount } from './index';
import { holdPayoutForBooking, refundAffectsPayout } from './payouts';

/**
 * Ödeme akışının gövdesi.
 *
 * Sağlayıcı bağdaştırıcısı (`iyzico.ts`, `fake.ts`) yalnızca "nasıl konuşulur"
 * sorusunu cevaplıyor. Burada olan şey **ne zaman güvenilir** sorusunun cevabı
 * ve iddiaların tamamı burada duruyor:
 *
 *   1. Sonuç geri çağrı gövdesinden okunmaz, token ile sağlayıcıya sorulur.
 *   2. Dönen tutar, para birimi ve eşleştirme kimliği bizim kaydımızla birebir
 *      karşılaştırılır; uyuşmazsa ödeme reddedilir ve günlüğe `denied` düşer.
 *   3. Onay tek koşullu UPDATE'tir (`lib/db/payments.ts`), bu yüzden aynı geri
 *      çağrı kaç kez gelirse gelsin rezervasyon tam olarak bir kez onaylanır.
 */

/** Sağlayıcının kullanıcıyı geri göndereceği adres. */
export const PAYMENT_CALLBACK_PATH = '/odeme/donus';

export type OnlinePaymentAvailability =
  | { available: true; submerchantKey: string; commissionBp: number }
  | { available: false; reason: 'provider_disabled' | 'no_submerchant' };

/**
 * Bu işletme için online ödeme açık mı.
 *
 * İki koşul birlikte aranır: sağlayıcı yapılandırılmış olmalı **ve** işletmenin
 * alt üye işyeri anahtarı bulunmalı. İkincisi olmadan para RASTLA'da toplanır
 * ama işletmeye aktarılamaz — o yüzden anahtarsız işletmede ödeme başlatmak
 * yerine ödemesiz rezervasyona düşülür.
 */
export async function onlinePaymentFor(operatorId: string): Promise<OnlinePaymentAvailability> {
  if (!paymentProvider()) return { available: false, reason: 'provider_disabled' };

  const operator = await getOperator(operatorId);
  if (!operator?.submerchantKey) return { available: false, reason: 'no_submerchant' };

  return {
    available: true,
    submerchantKey: operator.submerchantKey,
    commissionBp: operator.commissionBp,
  };
}

export type StartResult = { ok: true; formUrl: string } | { ok: false; error: string };

/**
 * Ödeme oturumunu başlatır ve kullanıcının gönderileceği adresi döner.
 *
 * Kayıt ÖNCE yazılır, sağlayıcı SONRA çağrılır. Tersi yapılsaydı ve sağlayıcı
 * cevabı ile bizim yazımız arasında süreç ölseydi, elimizde karşılığı olmayan
 * bir ödeme oturumu kalırdı: kullanıcı öderdi, biz hangi rezervasyona ait
 * olduğunu bilemezdik.
 */
export async function startPayment(input: {
  booking: Booking;
  activityTitle: string;
  activityCategory: string;
  submerchantKey: string;
  commissionBp: number;
  buyer: { id: string; name: string; phone: string };
  context: RequestContext;
}): Promise<StartResult> {
  const provider = paymentProvider();
  if (!provider) return { ok: false, error: 'Ödeme sağlayıcısı yapılandırılmamış.' };

  const { commissionTRY, submerchantTRY } = splitAmount(
    input.booking.totalTRY,
    input.commissionBp
  );

  // Eşleştirme kimliği rezervasyonun kimliği: dönen cevabın hangi kayda ait
  // olduğu böylece sağlayıcının verdiği bir değere değil, bizim ürettiğimiz
  // bir değere dayanır.
  const payment = await createPayment({
    bookingId: input.booking.id,
    provider: provider.name,
    conversationId: input.booking.id,
    amountTRY: input.booking.totalTRY,
    commissionTRY,
  });

  const session = await provider.startCheckout({
    conversationId: payment.conversationId,
    amountTRY: input.booking.totalTRY,
    submerchantAmountTRY: submerchantTRY,
    submerchantKey: input.submerchantKey,
    buyer: {
      id: input.buyer.id,
      name: input.buyer.name,
      phone: input.buyer.phone,
      ip: input.context.ip,
    },
    item: {
      id: input.booking.activitySlug,
      name: input.activityTitle,
      category: input.activityCategory,
    },
    callbackUrl: `${SITE_URL}${PAYMENT_CALLBACK_PATH}`,
  });

  if (!session.ok) {
    await markPaymentFailed(payment.id, session.error);
    await record({
      action: 'payment.failed',
      actorType: 'customer',
      actorId: input.buyer.id,
      operatorId: input.booking.operatorId,
      targetType: 'booking',
      targetId: input.booking.id,
      outcome: 'failure',
      ...input.context,
      meta: { stage: 'start', provider: provider.name },
    });
    return { ok: false, error: 'Ödeme başlatılamadı. Lütfen tekrar deneyin.' };
  }

  await attachToken(payment.id, session.token);

  await record({
    action: 'payment.started',
    actorType: 'customer',
    actorId: input.buyer.id,
    operatorId: input.booking.operatorId,
    targetType: 'booking',
    targetId: input.booking.id,
    ...input.context,
    // Tutar ve komisyon günlüğe girer; mutabakatta gereken bilgi bu.
    // Kart bilgisi diye bir şey yok, olamaz da: form sağlayıcıda.
    meta: { provider: provider.name, amountTRY: input.booking.totalTRY, commissionTRY },
  });

  return { ok: true, formUrl: session.formUrl };
}

export type CallbackOutcome =
  | { ok: true; code: string }
  | { ok: false; reason: 'unknown_token' | 'denied' | 'failed' | 'booking_gone' };

/**
 * Sağlayıcıdan dönüşü işler.
 *
 * **Geri çağrının gövdesine güvenilmez.** Elimizdeki tek girdi token; sonuç
 * `provider.resolve()` ile sağlayıcıdan çekilir. Gövdedeki "ödendi" alanına
 * güvenilseydi, adresi bilen biri kendi uydurduğu bir isteği yollayarak bedava
 * bilet üretebilirdi.
 */
export async function resolveCallback(
  token: string,
  context: RequestContext
): Promise<CallbackOutcome> {
  const provider = paymentProvider();
  if (!provider) return { ok: false, reason: 'unknown_token' };

  const payment = await getPaymentByToken(token);
  if (!payment) return { ok: false, reason: 'unknown_token' };

  const result = await provider.resolve(token);

  const target = {
    operatorId: null as string | null,
    targetType: 'payment',
    targetId: payment.id,
  };

  if (!result.ok) {
    await markPaymentFailed(payment.id, result.error);
    await record({
      action: 'payment.failed',
      actorType: 'customer',
      ...target,
      outcome: 'failure',
      ...context,
      meta: { stage: 'callback', provider: provider.name, bookingId: payment.bookingId },
    });
    return { ok: false, reason: 'failed' };
  }

  // ---- Üç alanlı doğrulama ----
  //
  // Sağlayıcı doğru cevap verse bile cevabın BİZİM kaydımıza ait olduğu ve
  // BEKLEDİĞİMİZ tutarı taşıdığı ayrıca sınanır. Tutarı kurcalayarak 1 TL'ye
  // 2000 TL'lik bilet almayı deneyen bir istek buradan geçemez.
  const mismatches: string[] = [];
  if (result.conversationId !== payment.conversationId) mismatches.push('conversationId');
  if (result.currency !== payment.currency) mismatches.push('currency');
  if (Math.round(result.paidTRY) !== payment.amountTRY) mismatches.push('amount');

  if (mismatches.length > 0) {
    await markPaymentFailed(payment.id, `uyuşmazlık: ${mismatches.join(', ')}`);
    await record({
      action: 'payment.denied',
      actorType: 'customer',
      ...target,
      outcome: 'denied',
      ...context,
      meta: {
        mismatches,
        beklenenTutar: payment.amountTRY,
        gelenTutar: Math.round(result.paidTRY),
        bookingId: payment.bookingId,
      },
    });
    return { ok: false, reason: 'denied' };
  }

  await markPaymentSucceeded({
    paymentId: payment.id,
    providerRef: result.providerRef,
    cardFamily: result.cardFamily,
    cardLastFour: result.cardLastFour,
    itemTransactionRef: result.itemTransactionRef,
  });

  // Ödeme kaydı zaten işaretlenmiş olsa bile onay DENENİR: iki adım arasında
  // süreç ölürse, sonraki geri çağrı rezervasyonu yine de onaylayabilmeli.
  const confirmed = await confirmBookingPayment(payment.bookingId);

  const booking = await getBooking(payment.bookingId);
  if (!booking) return { ok: false, reason: 'booking_gone' };

  if (!confirmed.ok) {
    // Rezervasyon süresi dolmuş ya da iptal edilmiş ama para yine de alınmış.
    // Sessizce geçilemez: müşteriye iade edilmesi gereken bir tutar var.
    await record({
      action: 'payment.succeeded',
      actorType: 'customer',
      actorId: booking.userId,
      operatorId: booking.operatorId,
      targetType: 'booking',
      targetId: booking.id,
      outcome: 'failure',
      ...context,
      meta: { reason: 'booking_not_pending', bookingStatus: booking.status },
    });
    return { ok: false, reason: 'failed' };
  }

  // Para tahsil edildi ama HENÜZ KİMSENİN DEĞİL: işletmenin payı hizmet
  // verilene kadar bloke tutulur. Tekrar çağrılması zararsız — defterdeki
  // UNIQUE kısıt ikinci kaydı reddeder.
  await holdPayoutForBooking({ bookingId: booking.id, operatorId: booking.operatorId });

  // Tekrar gelen geri çağrı yeni bir kayıt üretmez: günlükte her başarılı
  // ödeme tam olarak bir satır.
  if (!confirmed.alreadyConfirmed) {
    await record({
      action: 'payment.succeeded',
      actorType: 'customer',
      actorId: booking.userId,
      operatorId: booking.operatorId,
      targetType: 'booking',
      targetId: booking.id,
      ...context,
      meta: {
        provider: provider.name,
        amountTRY: payment.amountTRY,
        commissionTRY: payment.commissionTRY,
        cardLastFour: result.cardLastFour ?? null,
      },
    });
  }

  return { ok: true, code: booking.code };
}

// -------------------------------------------------------------------- iade

export type RefundOutcome =
  | { ok: true; amountTRY: number }
  | { ok: false; reason: 'no_payment' | 'already_refunded' | 'provider_error' };

/**
 * Rezervasyonun ödemesini iade eder.
 *
 * İki kez çağrılması zararsız: `refunds` tablosundaki `UNIQUE (payment_id,
 * reason)` ikinci kaydı reddeder ve sağlayıcıya ikinci bir iade isteği hiç
 * gitmez. Kontrol veritabanında, kodda değil — "önce bak, sonra gönder"
 * yazılsaydı iki eşzamanlı iptal parayı iki kez geri gönderebilirdi.
 */
export async function refundBooking(input: {
  bookingId: string;
  operatorId: string;
  reason: RefundReason;
  context: RequestContext;
}): Promise<RefundOutcome> {
  const provider = paymentProvider();
  if (!provider) return { ok: false, reason: 'no_payment' };

  const payment = await getSucceededPayment(input.bookingId);
  if (!payment?.providerRef) return { ok: false, reason: 'no_payment' };

  const opened = await beginRefund({
    paymentId: payment.id,
    amountTRY: payment.amountTRY,
    reason: input.reason,
  });
  if (!opened.ok) return { ok: false, reason: 'already_refunded' };

  const result = await provider.refund({
    providerRef: payment.providerRef,
    amountTRY: payment.amountTRY,
    ip: input.context.ip,
  });

  if (!result.ok) {
    await completeRefund(opened.refundId, { ok: false, error: result.error });
    await record({
      action: 'payment.refund_failed',
      actorType: 'system',
      operatorId: input.operatorId,
      targetType: 'booking',
      targetId: input.bookingId,
      outcome: 'failure',
      ...input.context,
      meta: { reason: input.reason, amountTRY: payment.amountTRY },
    });
    return { ok: false, reason: 'provider_error' };
  }

  await completeRefund(opened.refundId, { ok: true, providerRef: result.providerRef });

  // Para müşteriye döndü; işletmenin hak edişi de aynı ölçüde azalır. Defter
  // güncellenmeseydi mutabakat raporu iade edilmiş bir tutarı hâlâ "işletmenin
  // alacağı" olarak gösterirdi.
  await refundAffectsPayout(input.bookingId, payment.amountTRY);

  await record({
    action: 'payment.refunded',
    actorType: 'system',
    operatorId: input.operatorId,
    targetType: 'booking',
    targetId: input.bookingId,
    ...input.context,
    meta: { reason: input.reason, amountTRY: payment.amountTRY },
  });

  return { ok: true, amountTRY: payment.amountTRY };
}

/**
 * Müşteri iptalinde iade var mı.
 *
 * Mesafeli Sözleşmeler Yönetmeliği md. 15 uyarınca **belirli tarihte yapılan
 * eğlence ve dinlenme hizmetleri cayma hakkı istisnasındadır**; yani 14 günlük
 * koşulsuz iade zorunluluğu bu hizmet için geçerli değil ve kendi politikamızı
 * belirleyebiliyoruz. Belirlenen politika: aktiviteden 24 saat öncesine kadar
 * tam iade, sonrasında iade yok — işletme o saati başkasına satamayacağı için.
 *
 * Bu eşik ön bilgilendirme formunda AÇIKÇA yazılmak zorunda; yazılmazsa
 * geçerli sayılmaz.
 */
export const FREE_CANCELLATION_HOURS = Number(process.env.FREE_CANCELLATION_HOURS ?? 24);

export function customerRefundAllowed(booking: Booking, now = new Date()): boolean {
  const start = new Date(`${booking.bookingDate}T${booking.bookingTime}:00`);
  const hoursLeft = (start.getTime() - now.getTime()) / (60 * 60 * 1000);
  return hoursLeft >= FREE_CANCELLATION_HOURS;
}
