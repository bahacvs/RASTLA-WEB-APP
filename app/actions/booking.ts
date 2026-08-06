'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cancelBooking, createBooking, getBookingByCode } from '@/lib/db/bookings';
import { findOrCreateUser, getUser, normalizePhone } from '@/lib/db/users';
import { getSlot, listSlots, releaseCapacity, reserveCapacity, type Slot } from '@/lib/db/slots';
import { getUserId, setUserSession } from '@/lib/session';
import { currentUserId } from '@/lib/auth';
import { sendVerificationCode, verifyCode } from '@/lib/verification';
import { bookingCodeMessage } from '@/lib/sms/messages';
import { maskPhone } from '@/lib/sms';
import { getActivityBySlug } from '@/lib/db/activities';
import {
  customerRefundAllowed,
  FREE_CANCELLATION_HOURS,
  onlinePaymentFor,
  refundBooking,
  startPayment,
} from '@/lib/payments/flow';
import { expireBooking } from '@/lib/db/payments';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';
import {
  bucketKey,
  consume,
  describeRetry,
  LIMITS,
  type LimitRule,
} from '@/lib/db/rate-limit';

/**
 * `step === 'verify'` arayüzün kod ekranına geçmesini söyler.
 *
 * Doğrulama rezervasyondan ÖNCE yapılır: kapasite tutulduktan sonra
 * doğrulama istenseydi, doğrulamayan biri slotları tutup bırakmayarak
 * işletmenin gününü doldurabilirdi.
 */
export type BookingFormState = {
  error?: string;
  step?: 'verify';
  phoneHint?: string;
};

/** Seçilen aktivitenin kapasite moduna göre slottan kaç birim düşeceğini hesaplar. */
function unitsFor(capacityMode: 'per_person' | 'per_booking', party: number): number {
  return capacityMode === 'per_person' ? party : 1;
}

/** Takvimde bir gün seçildiğinde o günün slotlarını getirir. */
export async function slotsForDate(activitySlug: string, date: string): Promise<Slot[]> {
  const activity = await getActivityBySlug(activitySlug);
  if (!activity) return [];
  const slots = await listSlots(activity.id, date);
  return slots.filter((s) => s.status === 'open');
}

/**
 * Rezervasyon oluşturur ve kullanıcıyı biletine yönlendirir.
 *
 * Kapasite önce slottan düşülür, rezervasyon ondan sonra yazılır. Sıralama
 * bilinçli: kapasite alınamazsa hiç rezervasyon oluşmaz. Rezervasyon yazımı
 * beklenmedik biçimde başarısız olursa kapasite geri verilir.
 *
 * Tutar formdan alınmaz, sunucuda aktivite verisinden yeniden hesaplanır —
 * istemciden gelen fiyata güvenilmez.
 */
export async function createBookingAction(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  const slug = String(formData.get('slug') ?? '');
  const activity = await getActivityBySlug(slug);
  if (!activity) return { error: 'Aktivite bulunamadı.' };

  const name = String(formData.get('name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const slotId = String(formData.get('slotId') ?? '').trim();
  const adults = Number(formData.get('adults') ?? 0);
  const children = Number(formData.get('children') ?? 0);

  if (name.length < 2) return { error: 'Lütfen adınızı girin.' };
  if (phone.replace(/\D/g, '').length < 10) return { error: 'Geçerli bir telefon numarası girin.' };
  if (!slotId) return { error: 'Lütfen tarih ve saat seçin.' };
  if (!Number.isInteger(adults) || adults < 1) return { error: 'En az bir yetişkin gerekli.' };
  if (!Number.isInteger(children) || children < 0) return { error: 'Çocuk sayısı geçersiz.' };

  const normalizedPhone = normalizePhone(phone);

  // ---- Numara doğrulaması ----
  //
  // Doğrulanmış oturumu olan ve AYNI numarayı giren kişiden yeniden kod
  // istenmez: oturum 90 gün yaşıyor, her rezervasyonda kod istemek geri dönen
  // müşteriyi cezalandırmak olurdu. Numara değiştiyse yeni numara doğrulanır —
  // bilet ve iptal bildirimleri oraya gidecek.
  const sessionUserId = await currentUserId();
  const sessionUser = sessionUserId ? await getUser(sessionUserId) : null;

  if (!sessionUser || sessionUser.phone !== normalizedPhone) {
    const code = String(formData.get('code') ?? '').trim();

    // Kod girilmemişse gönder ve kod ekranını iste. Girilmişse doğrula.
    // İkisi tek eylemde: ayrı bir doğrulama eylemi olsaydı "hangi numara
    // doğrulandı" kuralı iki yerde yaşar ve biri gevşetilebilirdi.
    if (!code) {
      const sent = await sendVerificationCode({
        phone: normalizedPhone,
        purpose: 'booking',
        message: bookingCodeMessage,
      });

      if (!sent.ok) return { error: sent.error };
      return { step: 'verify', phoneHint: maskPhone(normalizedPhone) };
    }

    const verified = await verifyCode({ phone: normalizedPhone, purpose: 'booking', code });
    if (!verified.ok) {
      // Yanlış kodda YENİ kod gönderilmez: her denemede yeniden göndermek
      // hem hız sınırını tüketirdi hem de kullanıcının elindeki kodu
      // geçersiz kılıp onu sonsuz döngüye sokardı.
      return { error: verified.error, step: 'verify', phoneHint: maskPhone(normalizedPhone) };
    }

    // Doğrulandı; oturum aşağıda rezervasyonla birlikte kurulur.
  }

  // Sınır, kapasite düşülmeden önce uygulanır: sonra uygulansaydı reddedilen
  // istek yine bir slotu doldurup geri vermiş olurdu.
  //
  // İki kova. Asıl sınır telefon numarasında — müşterinin kimliği odur.
  // IP çok daha geniş bir emniyet ağı; sebebi CGNAT (bkz. lib/db/rate-limit.ts).
  const context = await requestContext();
  const gates: Array<[string, LimitRule]> = [
    [bucketKey('booking:phone', normalizePhone(phone)), LIMITS.bookingByPhone],
  ];
  if (context.ip) gates.push([bucketKey('booking:ip', context.ip), LIMITS.bookingByIp]);

  for (const [bucket, rule] of gates) {
    const gate = await consume(bucket, rule);
    if (!gate.allowed) {
      return {
        error: `Kısa sürede çok fazla rezervasyon oluşturuldu. ${describeRetry(
          gate.retryAfterSeconds
        )} sonra tekrar deneyin.`,
      };
    }
  }

  const slot = await getSlot(slotId);
  if (!slot) return { error: 'Seçilen saat bulunamadı. Lütfen tekrar seçin.' };
  // Slotun gerçekten bu aktiviteye ait olduğu doğrulanır; istemciden gelen
  // kimliğe güvenilmez.
  if (slot.activityId !== activity.id) return { error: 'Seçilen saat bu aktiviteye ait değil.' };

  const units = unitsFor(activity.capacityMode, adults + children);

  const reserved = await reserveCapacity(slot.id, units);
  if (!reserved.ok) {
    if (reserved.reason === 'full') {
      return { error: 'Bu saat az önce doldu. Lütfen başka bir saat seçin.' };
    }
    if (reserved.reason === 'closed') {
      return { error: 'Bu saat rezervasyona kapalı. Lütfen başka bir saat seçin.' };
    }
    return { error: 'Seçilen saat bulunamadı. Lütfen tekrar seçin.' };
  }

  // Online ödeme yalnızca sağlayıcı yapılandırılmışsa VE işletmenin alt üye
  // işyeri anahtarı varsa devreye girer. Ücretsiz aktivitede de tahsilat
  // yapılmaz — sıfır tutarlı bir ödeme oturumu açmanın anlamı yok.
  const totalTRY = (adults + children) * activity.priceTRY;
  const online = totalTRY > 0 ? await onlinePaymentFor(activity.operatorId) : null;
  const payOnline = online?.available === true;

  try {
    const user = await findOrCreateUser(name, phone);
    if ((await getUserId()) !== user.id) await setUserSession(user.id);

    const booking = await createBooking({
      userId: user.id,
      activitySlug: activity.slug,
      operatorId: activity.operatorId,
      slotId: slot.id,
      units,
      bookingDate: slot.date,
      bookingTime: slot.time,
      adults,
      children,
      totalTRY,
      // Ödeme alınacaksa bilet HENÜZ GEÇERLİ DEĞİL. Kapasite tutuluyor ama
      // `redeemBooking` yalnızca 'confirmed' kaydı okutur; ödemesi
      // tamamlanmamış bir QR kapıda çalışmaz.
      status: payOnline ? 'pending_payment' : 'confirmed',
    });

    // Misafirin adı ve telefonu günlüğe KOPYALANMAZ; kayıt zaten hangi
    // rezervasyonu işaret ettiğini biliyor.
    await record({
      action: 'booking.created',
      actorType: 'customer',
      actorId: user.id,
      operatorId: activity.operatorId,
      targetType: 'booking',
      targetId: booking.id,
      ...context,
      meta: { slotId: slot.id, units, party: adults + children, odemeli: payOnline },
    });

    if (payOnline && online?.available) {
      const started = await startPayment({
        booking,
        activityTitle: activity.title,
        activityCategory: activity.category,
        submerchantKey: online.submerchantKey,
        commissionBp: online.commissionBp,
        buyer: { id: user.id, name: user.name, phone: user.phone },
        context,
      });

      if (!started.ok) {
        // Ödeme oturumu açılamadıysa rezervasyon askıda kalmamalı: kapasite
        // hemen geri verilir, kullanıcı yeniden deneyebilir. Beklemek de bir
        // seçenekti (süre aşımı işi zaten toplardı) ama o zaman kullanıcı 20
        // dakika boyunca kendi tuttuğu yeri yeniden seçemezdi.
        await expireBooking(booking.id);
        return { error: started.error };
      }

      // Sağlayıcının barındırdığı forma gidilir; kart verisi bu sunucuya
      // hiç değmez.
      redirect(started.formUrl);
    }

    redirect(`/bilet/${booking.code}`);
  } catch (error) {
    // redirect() içeride bir hata fırlatarak çalışır; onu yutmamak gerekir.
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    if (typeof error === 'object' && error !== null && 'digest' in error) {
      const digest = (error as { digest?: string }).digest;
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) throw error;
    }

    // Rezervasyon yazılamadıysa kapasiteyi geri ver; yoksa yer boşuna kilitlenir.
    await releaseCapacity(slot.id, units);
    return { error: 'Rezervasyon oluşturulamadı. Lütfen tekrar deneyin.' };
  }

  return {};
}

export type CancelState = { error?: string; message?: string };

/**
 * Müşterinin kendi rezervasyonunu iptal etmesi.
 *
 * Yalnızca kendi kaydına dokunabilir; başkasının kodunu girmek işe yaramaz.
 * Kapasite iadesi lib/db/bookings.ts içinde, tek bir koşullu UPDATE'in
 * ardından yapılır — çift gönderim kapasiteyi şişirmez.
 */
export async function cancelBookingAction(
  _prev: CancelState,
  formData: FormData
): Promise<CancelState> {
  const code = String(formData.get('code') ?? '').trim();
  if (!code) return { error: 'Bilet kodu eksik.' };

  const userId = await currentUserId();
  if (!userId) return { error: 'Oturum bulunamadı. Rezervasyonu yapan cihazdan deneyin.' };

  const booking = await getBookingByCode(code);
  if (!booking || booking.userId !== userId) {
    return { error: 'Bu rezervasyona erişim yetkiniz yok.' };
  }

  const result = await cancelBooking(code, 'customer');
  if (!result.ok) {
    if (result.reason === 'already_redeemed') {
      return { error: 'Bu bilet kullanılmış, iptal edilemez.' };
    }
    if (result.reason === 'already_cancelled') return { error: 'Bu rezervasyon zaten iptal.' };
    return { error: 'Rezervasyon bulunamadı.' };
  }

  const cancelContext = await requestContext();

  await record({
    action: 'booking.cancelled',
    actorType: 'customer',
    actorId: userId,
    operatorId: booking.operatorId,
    targetType: 'booking',
    targetId: booking.id,
    ...cancelContext,
    meta: { reason: 'customer' },
  });

  // İade politikası: aktiviteden FREE_CANCELLATION_HOURS saat öncesine kadar
  // tam iade, sonrasında iade yok (bkz. lib/payments/flow.ts — Mesafeli
  // Sözleşmeler Yönetmeliği md. 15 istisnası). Eşikten sonra iptal yine
  // yapılabilir; işletme yeri başkasına satabilsin diye.
  let refundNote = '';
  if (customerRefundAllowed(booking)) {
    const refund = await refundBooking({
      bookingId: booking.id,
      operatorId: booking.operatorId,
      reason: 'customer',
      context: cancelContext,
    });
    if (refund.ok) refundNote = ' Ödemeniz iade edildi; kartınıza yansıması birkaç gün sürebilir.';
  } else if (booking.totalTRY > 0) {
    refundNote = ` Aktiviteye ${FREE_CANCELLATION_HOURS} saatten az kaldığı için ücret iadesi yapılmadı.`;
  }

  revalidatePath('/rezervasyonlarim');
  revalidatePath(`/bilet/${code}`);
  return { message: `Rezervasyonunuz iptal edildi.${refundNote}` };
}
