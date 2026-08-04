'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cancelBooking, createBooking, getBookingByCode } from '@/lib/db/bookings';
import { findOrCreateUser } from '@/lib/db/users';
import { getSlot, listSlots, releaseCapacity, reserveCapacity, type Slot } from '@/lib/db/slots';
import { getUserId, setUserSession } from '@/lib/session';
import { getActivityBySlug } from '@/lib/db/activities';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';

export type BookingFormState = { error?: string };

/** Seçilen aktivitenin kapasite moduna göre slottan kaç birim düşeceğini hesaplar. */
function unitsFor(capacityMode: 'per_person' | 'per_booking', party: number): number {
  return capacityMode === 'per_person' ? party : 1;
}

/** Takvimde bir gün seçildiğinde o günün slotlarını getirir. */
export async function slotsForDate(activitySlug: string, date: string): Promise<Slot[]> {
  const activity = getActivityBySlug(activitySlug);
  if (!activity) return [];
  return listSlots(activity.id, date).filter((s) => s.status === 'open');
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
  const activity = getActivityBySlug(slug);
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

  const slot = getSlot(slotId);
  if (!slot) return { error: 'Seçilen saat bulunamadı. Lütfen tekrar seçin.' };
  // Slotun gerçekten bu aktiviteye ait olduğu doğrulanır; istemciden gelen
  // kimliğe güvenilmez.
  if (slot.activityId !== activity.id) return { error: 'Seçilen saat bu aktiviteye ait değil.' };

  const units = unitsFor(activity.capacityMode, adults + children);

  const reserved = reserveCapacity(slot.id, units);
  if (!reserved.ok) {
    if (reserved.reason === 'full') {
      return { error: 'Bu saat az önce doldu. Lütfen başka bir saat seçin.' };
    }
    if (reserved.reason === 'closed') {
      return { error: 'Bu saat rezervasyona kapalı. Lütfen başka bir saat seçin.' };
    }
    return { error: 'Seçilen saat bulunamadı. Lütfen tekrar seçin.' };
  }

  try {
    const user = findOrCreateUser(name, phone);
    if ((await getUserId()) !== user.id) await setUserSession(user.id);

    const booking = createBooking({
      userId: user.id,
      activitySlug: activity.slug,
      operatorId: activity.operatorId,
      slotId: slot.id,
      units,
      bookingDate: slot.date,
      bookingTime: slot.time,
      adults,
      children,
      totalTRY: (adults + children) * activity.priceTRY,
    });

    // Misafirin adı ve telefonu günlüğe KOPYALANMAZ; kayıt zaten hangi
    // rezervasyonu işaret ettiğini biliyor.
    record({
      action: 'booking.created',
      actorType: 'customer',
      actorId: user.id,
      operatorId: activity.operatorId,
      targetType: 'booking',
      targetId: booking.id,
      ...(await requestContext()),
      meta: { slotId: slot.id, units, party: adults + children },
    });

    redirect(`/bilet/${booking.code}`);
  } catch (error) {
    // redirect() içeride bir hata fırlatarak çalışır; onu yutmamak gerekir.
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    if (typeof error === 'object' && error !== null && 'digest' in error) {
      const digest = (error as { digest?: string }).digest;
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) throw error;
    }

    // Rezervasyon yazılamadıysa kapasiteyi geri ver; yoksa yer boşuna kilitlenir.
    releaseCapacity(slot.id, units);
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

  const userId = await getUserId();
  if (!userId) return { error: 'Oturum bulunamadı. Rezervasyonu yapan cihazdan deneyin.' };

  const booking = getBookingByCode(code);
  if (!booking || booking.userId !== userId) {
    return { error: 'Bu rezervasyona erişim yetkiniz yok.' };
  }

  const result = cancelBooking(code, 'customer');
  if (!result.ok) {
    if (result.reason === 'already_redeemed') {
      return { error: 'Bu bilet kullanılmış, iptal edilemez.' };
    }
    if (result.reason === 'already_cancelled') return { error: 'Bu rezervasyon zaten iptal.' };
    return { error: 'Rezervasyon bulunamadı.' };
  }

  record({
    action: 'booking.cancelled',
    actorType: 'customer',
    actorId: userId,
    operatorId: booking.operatorId,
    targetType: 'booking',
    targetId: booking.id,
    ...(await requestContext()),
    meta: { reason: 'customer' },
  });

  revalidatePath('/rezervasyonlarim');
  revalidatePath(`/bilet/${code}`);
  return { message: 'Rezervasyonunuz iptal edildi.' };
}
