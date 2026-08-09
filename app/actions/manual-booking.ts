'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { getActivityById, listActivitiesForOperator } from '@/lib/db/activities';
import { createBooking, BOOKING_SOURCES, type BookingSource } from '@/lib/db/bookings';
import { gateBooking, getSlot, listSlots, reserveCapacity, type Slot } from '@/lib/db/slots';
import { findOrCreateUser, normalizePhone } from '@/lib/db/users';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';
import { loadPricing } from '@/lib/db/pricing';
import { quote } from '@/lib/pricing.mjs';

/**
 * Telefondan, WhatsApp'tan ya da resepsiyondan gelen müşteriyi elle eklemek.
 *
 * Bu özelliğin varlık sebebi komisyon değil, MÜSAİTLİĞİN DOĞRU OLMASI.
 * İşletme telefondan aldığı rezervasyonu sisteme girmezse, RASTLA müşterisine
 * boş görünen saat aslında doludur ve iki grup aynı saatte iskeleye gelir.
 * Bu yüzden manuel kayıt ücretsizdir ve olabildiğince hızlı olmalıdır —
 * işletme telefonu kapatmadan bitirebilmeli.
 *
 * ÖNEMLİ: Manuel rezervasyon da tam olarak aynı kapasite yolundan geçer
 * (`gateBooking` + `reserveCapacity`). Ayrı bir kısayol açmak, bu özelliğin
 * çözmek için var olduğu problemi geri getirirdi.
 *
 * Komisyon üretmez: ödeme kaydı oluşturulmaz, `payment_mode` tesiste ödeme
 * olarak işaretlenir.
 */
export type ManualBookingState = {
  error?: string;
  message?: string;
  /** Oluşan rezervasyonun bilet kodu — işletme müşteriye söyleyebilsin. */
  code?: string;
};

export async function createManualBookingAction(
  _prev: ManualBookingState,
  formData: FormData
): Promise<ManualBookingState> {
  const session = await requireCapability('rezervasyon.manuel');
  if (!session) return { error: 'Bu işlem için yetkiniz yok.' };

  const slotId = String(formData.get('slotId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const phoneRaw = String(formData.get('phone') ?? '');
  const people = Number(formData.get('people'));
  const sourceRaw = String(formData.get('source') ?? 'phone');
  const paid = formData.get('paid') === 'on';

  if (name.length < 2) return { error: 'Müşteri adını girin.' };

  const phone = normalizePhone(phoneRaw);
  if (phone.length < 12) return { error: 'Geçerli bir cep telefonu girin.' };

  if (!Number.isInteger(people) || people < 1) return { error: 'Kişi sayısını girin.' };

  const source: BookingSource = BOOKING_SOURCES.includes(sourceRaw as BookingSource)
    ? (sourceRaw as BookingSource)
    : 'manual';

  const slot = await getSlot(slotId);
  if (!slot) return { error: 'Seçilen saat bulunamadı.' };

  const activity = await getActivityById(slot.activityId);
  // İşletme yalnızca kendi aktivitesine kayıt açabilir; slot kimliği
  // istemciden geliyor ve ona güvenilmez.
  if (!activity || activity.operatorId !== session.operator.id) {
    return { error: 'Bu aktiviteye kayıt açma yetkiniz yok.' };
  }

  // Kesit ve minimum katılımcı burada da geçerli: işletme kendi kuralını
  // farkında olmadan deldiğinde ortaya çıkan sorun müşteriye yansıyor.
  const gate = await gateBooking(activity, slot, people);
  if (!gate.ok) return { error: gate.error };

  const reserved = await reserveCapacity(slot.id, gate.units, gate.equipment);
  if (!reserved.ok) {
    if (reserved.reason === 'no_equipment') return { error: 'Bu saatte yeterli ekipman kalmadı.' };
    if (reserved.reason === 'full') return { error: 'Bu saat dolu.' };
    if (reserved.reason === 'closed') return { error: 'Bu saat rezervasyona kapalı.' };
    return { error: 'Seçilen saat bulunamadı.' };
  }

  const user = await findOrCreateUser(name, phone);

  // Telefondan gelen müşteriye de İNTERNETTEKİ fiyat söyleniyor: sezon
  // tarifesi ve grup indirimi burada da uygulanıyor. Elle hesaplanan bir
  // rakam yazılsaydı aynı saat için iki farklı fiyat çıkardı ve farkı ilk
  // gören müşteri olurdu.
  const pricing = await loadPricing(activity.id);
  const priced = quote({
    basePrice: activity.priceTRY,
    rules: pricing.rules,
    discounts: pricing.discounts,
    date: slot.date,
    time: slot.time,
    people,
  });

  const booking = await createBooking({
    userId: user.id,
    activitySlug: activity.slug,
    operatorId: activity.operatorId,
    slotId: slot.id,
    units: gate.units,
    equipmentUnits: gate.equipment,
    source,
    // Manuel kayıtta RASTLA para tahsil etmiyor; komisyon da doğmuyor.
    paymentMode: 'onsite',
    createdBy: session.user.id,
    bookingDate: slot.date,
    bookingTime: slot.time,
    adults: people,
    children: 0,
    totalTRY: paid ? priced.total : 0,
    // Ödeme akışı yok: rezervasyon doğrudan geçerli bir bilete dönüşür.
    status: 'confirmed',
  });

  await record({
    action: 'booking.created',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: session.operator.id,
    targetType: 'booking',
    targetId: booking.id,
    ...(await requestContext()),
    meta: { source, people, slot: `${slot.date} ${slot.time}`, manual: true },
  });

  revalidatePath('/isletme/bugun');
  revalidatePath('/isletme/rezervasyonlar');

  return { message: `${name} eklendi.`, code: booking.code };
}

/** Manuel kayıt formunun aktivite listesi. */
export async function activitiesForManualBooking() {
  const session = await requireCapability('rezervasyon.manuel');
  if (!session) return [];
  return listActivitiesForOperator(session.operator.id);
}

/** Seçilen aktivite ve gün için açık slotlar. */
export async function slotsForManualBooking(activityId: string, date: string): Promise<Slot[]> {
  const session = await requireCapability('rezervasyon.manuel');
  if (!session) return [];

  const activity = await getActivityById(activityId);
  if (!activity || activity.operatorId !== session.operator.id) return [];

  return listSlots(activityId, date);
}
