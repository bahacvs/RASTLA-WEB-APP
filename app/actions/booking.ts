'use server';

import { redirect } from 'next/navigation';
import { createBooking } from '@/lib/db/bookings';
import { findOrCreateUser } from '@/lib/db/users';
import { getUserId, setUserSession } from '@/lib/session';
import { getActivity } from '@/lib/data';

export type BookingFormState = { error?: string };

/**
 * Rezervasyon oluşturur ve kullanıcıyı biletine yönlendirir.
 *
 * Fiyat bilinçli olarak formdan alınmaz, sunucuda aktivite verisinden yeniden
 * hesaplanır — istemciden gelen tutara güvenilmez.
 */
export async function createBookingAction(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  const slug = String(formData.get('slug') ?? '');
  const activity = getActivity(slug);
  if (!activity) return { error: 'Aktivite bulunamadı.' };

  const name = String(formData.get('name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const date = String(formData.get('date') ?? '').trim();
  const time = String(formData.get('time') ?? '').trim();
  const adults = Number(formData.get('adults') ?? 0);
  const children = Number(formData.get('children') ?? 0);

  if (name.length < 2) return { error: 'Lütfen adınızı girin.' };
  if (phone.replace(/\D/g, '').length < 10) return { error: 'Geçerli bir telefon numarası girin.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Lütfen tarih seçin.' };
  if (!activity.timeSlots?.some((s) => s.time === time)) return { error: 'Lütfen geçerli bir saat seçin.' };
  if (!Number.isInteger(adults) || adults < 1) return { error: 'En az bir yetişkin gerekli.' };
  if (!Number.isInteger(children) || children < 0) return { error: 'Çocuk sayısı geçersiz.' };

  const user = findOrCreateUser(name, phone);

  // Aynı cihazdan tekrar girildiğinde rezervasyonlar görünsün.
  if ((await getUserId()) !== user.id) await setUserSession(user.id);

  const booking = createBooking({
    userId: user.id,
    activitySlug: activity.slug,
    operatorId: activity.operatorId,
    bookingDate: date,
    bookingTime: time,
    adults,
    children,
    totalTRY: (adults + children) * activity.priceTRY,
  });

  redirect(`/bilet/${booking.code}`);
}
