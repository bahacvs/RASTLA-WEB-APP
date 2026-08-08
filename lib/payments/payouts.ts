import { record } from '@/lib/db/audit';
import { getOperator } from '@/lib/db/operators';
import { getSucceededPayment } from '@/lib/db/payments';
import {
  claimRelease,
  claimReversal,
  getPayout,
  holdPayout,
  recordProviderOutcome,
  recordRefund,
} from '@/lib/db/payouts';
import { paymentProvider } from './index';

/**
 * Hak edişin akışı: ne zaman bloke, ne zaman serbest, ne zaman geri.
 *
 * Defterin kendisi `lib/db/payouts.ts` içinde ve oradaki her karar tek koşullu
 * bir UPDATE. Burada olan şey **hangi olayın hangi geçişi tetiklediği** ve
 * sağlayıcıya ne zaman haber verildiği.
 *
 * Sıralama kasıtlı: önce defter, sonra sağlayıcı. Tersi yapılsaydı, sağlayıcıya
 * çağrı gidip cevaptan önce süreç ölseydi, defterde iz kalmaz ve aynı pay
 * ikinci kez serbest bırakılmaya çalışılırdı. Bu sırayla en kötü ihtimal,
 * defterde "serbest bırakıldı ama sağlayıcıya iletilemedi" diyen ve tekrar
 * denenebilen bir satır.
 */

/**
 * Ödeme onaylandı — pay bloke edilir.
 *
 * Hizmet HENÜZ VERİLMEDİ. Ödemeyle birlikte serbest bırakmak, gelmeyen bir
 * müşterinin parasını da işletmeye aktarmak ve sonra geri istemek olurdu.
 */
export async function holdPayoutForBooking(input: {
  bookingId: string;
  operatorId: string;
}): Promise<void> {
  const payment = await getSucceededPayment(input.bookingId);
  if (!payment) return;

  const held = await holdPayout({
    bookingId: input.bookingId,
    paymentId: payment.id,
    operatorId: input.operatorId,
    grossTRY: payment.amountTRY,
    commissionTRY: payment.commissionTRY,
    providerRef: payment.itemTransactionRef,
  });

  // Tekrar gelen geri çağrı yeni bir kayıt üretmez ve günlüğe ikinci satır
  // düşmez: `duplicate` beklenen bir durum, hata değil.
  if (!held.ok) return;

  await record({
    action: 'payout.held',
    actorType: 'system',
    operatorId: input.operatorId,
    targetType: 'booking',
    targetId: input.bookingId,
    ip: null,
    userAgent: null,
    meta: {
      grossTRY: payment.amountTRY,
      commissionTRY: payment.commissionTRY,
      netTRY: payment.amountTRY - payment.commissionTRY,
    },
  });
}

/**
 * Bilet okutuldu — hizmet verildi, pay serbest bırakılır.
 *
 * `claimRelease` tek koşullu UPDATE olduğu için, aynı bileti aynı anda okutan
 * iki kasiyerden yalnızca biri buradan geçer; sağlayıcıya tek bir onay çağrısı
 * gider. Ödemesiz (manuel/tesiste ödemeli) rezervasyonlarda hak ediş kaydı
 * zaten yoktur ve fonksiyon sessizce döner — o parayı işletme kendisi tahsil
 * etmiştir, RASTLA'nın aktaracağı bir şey yok.
 */
export async function releasePayoutForBooking(bookingId: string): Promise<void> {
  // Hak edişi durdurulmuş işletmede pay BLOKE KALIR.
  //
  // Bu kontrol bilinçli olarak koşullu UPDATE'in DIŞINDA ve bu bir istisna
  // değil: durdurma bir yönetici kararı, yarışılan bir sayaç değil. Yarışan
  // şey "bu bileti kim okuttu" ve o karar aşağıdaki tek ifadede veriliyor.
  // Durdurma bayrağını ifadeye katmak, defteri operators tablosuna bağlayıp
  // her serbest bırakmayı birleştirmeye zorlardı; kazandırdığı bir güvence
  // yok, çünkü iki eşzamanlı okutmadan biri "durduruldu"yu diğeri
  // "durdurulmadı"yı görse bile sonuç yine tek bir serbest bırakma.
  const held = await getPayout(bookingId);
  if (held?.status === 'held') {
    const operator = await getOperator(held.operatorId);
    if (operator?.payoutsSuspended) {
      await recordProviderOutcome(bookingId, {
        ok: false,
        error: 'hak ediş durduruldu — RASTLA incelemesi',
      });
      await record({
        action: 'payout.suspended',
        actorType: 'system',
        operatorId: held.operatorId,
        targetType: 'booking',
        targetId: bookingId,
        outcome: 'denied',
        ip: null,
        userAgent: null,
        meta: { netTRY: held.netTRY },
      });
      return;
    }
  }

  const claimed = await claimRelease(bookingId);
  if (!claimed.ok) return;

  await record({
    action: 'payout.released',
    actorType: 'system',
    operatorId: claimed.payout.operatorId,
    targetType: 'booking',
    targetId: bookingId,
    ip: null,
    userAgent: null,
    meta: { netTRY: claimed.payout.netTRY, commissionTRY: claimed.payout.commissionTRY },
  });

  await tellProvider(bookingId, claimed.payout.providerRef, 'approve', claimed.payout.operatorId);
}

/**
 * Müşteri gelmedi ya da rezervasyon iade edildi — pay geri çevrilir.
 *
 * Ayrı bir "no-show iadesi" yolu açılmıyor: geri çevirme yalnızca payı
 * sağlayıcıda serbest bırakılmamış hâle getirir. Müşteriye para dönecekse o
 * ayrı bir karardır ve iade akışından geçer (`refundBooking`).
 */
export async function reversePayoutForBooking(bookingId: string): Promise<void> {
  const claimed = await claimReversal(bookingId);
  if (!claimed.ok) return;

  await record({
    action: 'payout.reversed',
    actorType: 'system',
    operatorId: claimed.payout.operatorId,
    targetType: 'booking',
    targetId: bookingId,
    ip: null,
    userAgent: null,
    meta: { grossTRY: claimed.payout.grossTRY },
  });

  await tellProvider(bookingId, claimed.payout.providerRef, 'disapprove', claimed.payout.operatorId);
}

/**
 * İade defteri etkiler: net tutar düşer, pay henüz bloke ise geri çevrilir.
 *
 * Sıra önemli — önce geri çevirme denenir. `claimReversal` yalnızca `held`
 * kaydı etkilediği için, serbest bırakılmış bir hak ediş bundan etkilenmez;
 * orada iade, net tutarın düşmesi olarak görünür.
 */
export async function refundAffectsPayout(bookingId: string, amountTRY: number): Promise<void> {
  if (!(await getPayout(bookingId))) return;

  await recordRefund(bookingId, amountTRY);
  await reversePayoutForBooking(bookingId);
}

/**
 * Sağlayıcıya kararı iletir.
 *
 * Başarısızlık defteri geri almaz; sebebi kayda geçer ve günlüğe `failure`
 * düşer. Böylece "para neden gitmedi" sorusunun cevabı, mutabakat ekranında
 * ve işlem günlüğünde aranabiliyor.
 *
 * Kalem işlem kimliği yoksa (ödeme, bu alan yakalanmaya başlamadan önce
 * alınmışsa) çağrı hiç yapılmaz ama defter yine ilerler: eski kayıtların
 * mutabakatı elle yapılacak ve bu, sessizce yanlış hesaplamaktan iyidir.
 */
async function tellProvider(
  bookingId: string,
  itemRef: string | null,
  action: 'approve' | 'disapprove',
  operatorId: string
): Promise<void> {
  const provider = paymentProvider();

  if (!provider || !itemRef) {
    await recordProviderOutcome(bookingId, {
      ok: false,
      error: itemRef ? 'ödeme sağlayıcısı kapalı' : 'kalem işlem kimliği yok',
    });
    return;
  }

  const result = action === 'approve'
    ? await provider.approve(itemRef)
    : await provider.disapprove(itemRef);

  await recordProviderOutcome(bookingId, result);
  if (result.ok) return;

  await record({
    action: 'payout.provider_failed',
    actorType: 'system',
    operatorId,
    targetType: 'booking',
    targetId: bookingId,
    outcome: 'failure',
    ip: null,
    userAgent: null,
    meta: { action, provider: provider.name },
  });
}
