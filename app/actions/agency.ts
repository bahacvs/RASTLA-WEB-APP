'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  authenticateAgencyUser,
  normalizeAgencyEmail,
  recordAgencyLogin,
} from '@/lib/db/agencies';
import { currentAgency } from '@/lib/agency-auth';
import { clearAgencySession, setAgencySession } from '@/lib/session';
import { getActivityById } from '@/lib/db/activities';
import { gateBooking, getSlot, releaseCapacity, reserveCapacity } from '@/lib/db/slots';
import { cancelBooking, createBooking, getBookingByCode } from '@/lib/db/bookings';
import { findOrCreateUser, normalizePhone } from '@/lib/db/users';
import { notifyCancellation } from '@/lib/notify.mjs';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';
import {
  bucketKey,
  consume,
  describeRetry,
  LIMITS,
  peek,
  reset,
  type LimitRule,
} from '@/lib/db/rate-limit';

/**
 * Acente portalının sunucu eylemleri.
 *
 * **Rezervasyon AYNI yoldan geçiyor**: `gateBooking` + `reserveCapacity` +
 * `createBooking`. Acenteye kısayol açmak, RASTLA müsaitliğini yanlış gösteren
 * şeyi — kanal dışı rezervasyonu — geri getirirdi; ayrıca kesit, minimum
 * katılımcı ve ekipman sınırı acente için de geçerli olmalı.
 *
 * Farklar yalnızca üç alanda:
 *   source        = 'agency'   (nereden geldiği kaydediliyor)
 *   payment_mode  = 'onsite'   (para tesiste alınıyor)
 *   agency_id     = <acente>   (hangi acente)
 *
 * **Ödeme ve hak ediş kaydı AÇILMIYOR.** Acente rezervasyonu bu turda
 * komisyon doğurmuyor (ticari karar) ve olmayan bir tahsilat için defter
 * satırı açmak, hak edişi baştan yanlış gösterirdi.
 */

export type AgencyLoginState = { error?: string };

export async function agencyLoginAction(
  _prev: AgencyLoginState,
  formData: FormData
): Promise<AgencyLoginState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const context = await requestContext();

  // İşletme girişindeki kova mantığının aynısı: sayılan şey BAŞARISIZ deneme.
  // Kontrol parola doğrulanmadan önce yapılıyor; sonra yapılsaydı her deneme
  // yine bir scrypt hesabı yaptırırdı.
  const emailBucket = bucketKey('agency-login:email', normalizeAgencyEmail(email));
  const buckets: Array<[string, LimitRule]> = [[emailBucket, LIMITS.loginByEmail]];
  if (context.ip) buckets.push([bucketKey('agency-login:ip', context.ip), LIMITS.loginByIp]);

  for (const [bucket, rule] of buckets) {
    const gate = await peek(bucket, rule);
    if (!gate.allowed) {
      return {
        error: `Çok fazla deneme yapıldı. ${describeRetry(gate.retryAfterSeconds)} sonra tekrar deneyin.`,
      };
    }
  }

  const result = await authenticateAgencyUser(email, password);

  if (!result.ok) {
    for (const [bucket, rule] of buckets) await consume(bucket, rule);

    if (result.reason === 'suspended') {
      return { error: 'Hesabınız ya da acenteniz askıya alınmış. RASTLA ile görüşün.' };
    }
    return { error: 'E-posta veya parola hatalı.' };
  }

  await reset(emailBucket);
  await recordAgencyLogin(result.user.id);
  await setAgencySession(result.user.id);

  await record({
    action: 'agency.login',
    actorType: 'operator',
    actorId: result.user.id,
    ...context,
    meta: { agencyId: result.agency.id },
  });

  redirect('/acente/ara');
}

export async function agencyLogoutAction() {
  await clearAgencySession();
  redirect('/acente');
}

export type AgencyBookingState = {
  error?: string;
  message?: string;
  /** Oluşan rezervasyonun bilet kodu — acente misafire söyleyebilsin. */
  code?: string;
};

export async function createAgencyBookingAction(
  _prev: AgencyBookingState,
  formData: FormData
): Promise<AgencyBookingState> {
  const session = await currentAgency();
  if (!session) return { error: 'Oturum sona ermiş. Yeniden giriş yapın.' };

  const slotId = String(formData.get('slotId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const phoneRaw = String(formData.get('phone') ?? '');
  const people = Number(formData.get('people'));

  if (name.length < 2) return { error: 'Misafirin adını girin.' };

  const phone = normalizePhone(phoneRaw);
  if (phone.length < 12) return { error: 'Geçerli bir cep telefonu girin.' };

  if (!Number.isInteger(people) || people < 1) return { error: 'Kişi sayısını girin.' };

  const slot = await getSlot(slotId);
  if (!slot) return { error: 'Seçilen saat bulunamadı.' };

  const activity = await getActivityById(slot.activityId);
  // Yayında olmayan bir ilana acente kayıt açamaz: taslak ya da incelemedeki
  // bir ilan müşteriye görünmüyor ve satılabilir değil.
  if (!activity || activity.status !== 'published') {
    return { error: 'Bu aktivite şu anda rezervasyona açık değil.' };
  }

  // Kesit, minimum katılımcı ve ekipman: acente için de aynen geçerli.
  const gate = await gateBooking(activity, slot, people);
  if (!gate.ok) return { error: gate.error };

  const reserved = await reserveCapacity(slot.id, gate.units, gate.equipment);
  if (!reserved.ok) {
    if (reserved.reason === 'no_equipment') return { error: 'Bu saatte yeterli ekipman kalmadı.' };
    if (reserved.reason === 'full') return { error: 'Bu saat az önce doldu.' };
    if (reserved.reason === 'closed') return { error: 'Bu saat rezervasyona kapalı.' };
    return { error: 'Seçilen saat bulunamadı.' };
  }

  const user = await findOrCreateUser(name, phone);

  let booking;
  try {
    booking = await createBooking({
      userId: user.id,
      activitySlug: activity.slug,
      operatorId: activity.operatorId,
      slotId: slot.id,
      units: gate.units,
      equipmentUnits: gate.equipment,
      source: 'agency',
      // RASTLA para tahsil etmiyor; komisyon ve hak ediş doğmuyor.
      paymentMode: 'onsite',
      agencyId: session.agency.id,
      bookingDate: slot.date,
      bookingTime: slot.time,
      adults: people,
      children: 0,
      totalTRY: people * activity.priceTRY,
      // Ödeme akışı yok: rezervasyon doğrudan geçerli bir bilete dönüşüyor.
      status: 'confirmed',
    });
  } catch (error) {
    // Kapasite tutuldu ama kayıt yazılamadı: tutulan yeri geri BIRAKIYORUZ.
    // Bırakılmazsa kimsenin kullanmadığı bir yer sonsuza kadar kilitli kalır.
    await releaseCapacity(slot.id, gate.units, gate.equipment);
    throw error;
  }

  await record({
    action: 'booking.created',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: activity.operatorId,
    targetType: 'booking',
    targetId: booking.id,
    ...(await requestContext()),
    meta: { source: 'agency', agencyId: session.agency.id, people },
  });

  revalidatePath('/acente/rezervasyonlarim');
  return {
    message: `${activity.title} · ${slot.date} ${slot.time} için yer tutuldu.`,
    code: booking.code,
  };
}

export type AgencyCancelState = { error?: string; message?: string };

/**
 * Acente kendi açtığı rezervasyonu iptal eder.
 *
 * Sahiplik `agency_id` üzerinden doğrulanıyor ve kimlik OTURUMDAN geliyor:
 * başka bir acentenin kodunu girmek işe yaramaz. Kod tahmin edilemez olsa da
 * kontrol yine yapılıyor — bilinen bir kodun yetki yerine geçmemesi gerekir.
 */
export async function cancelAgencyBookingAction(
  _prev: AgencyCancelState,
  formData: FormData
): Promise<AgencyCancelState> {
  const session = await currentAgency();
  if (!session) return { error: 'Oturum sona ermiş. Yeniden giriş yapın.' };

  const code = String(formData.get('code') ?? '').trim();
  if (!code) return { error: 'Bilet kodu eksik.' };

  const booking = await getBookingByCode(code);
  if (!booking || booking.agencyId !== session.agency.id) {
    return { error: 'Bu rezervasyona erişim yetkiniz yok.' };
  }

  const result = await cancelBooking(code, 'customer');
  if (!result.ok) {
    if (result.reason === 'already_redeemed') return { error: 'Bilet kullanılmış, iptal edilemez.' };
    if (result.reason === 'already_cancelled') return { error: 'Bu rezervasyon zaten iptal.' };
    return { error: 'Rezervasyon bulunamadı.' };
  }

  await record({
    action: 'booking.cancelled',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: booking.operatorId,
    targetType: 'booking',
    targetId: booking.id,
    ...(await requestContext()),
    meta: { reason: 'customer', agencyId: session.agency.id },
  });

  // Misafire de haber gidiyor: rezervasyonu acente açtı ama gelecek olan
  // misafir ve iptalden onun haberi olmalı.
  await notifyCancellation(result.booking, false);

  revalidatePath('/acente/rezervasyonlarim');
  return { message: 'Rezervasyon iptal edildi ve yer serbest bırakıldı.' };
}
