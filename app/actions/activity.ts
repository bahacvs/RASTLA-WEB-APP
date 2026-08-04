'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  createActivity,
  getActivityById,
  setActivityStatus,
  uniqueSlug,
  updateActivity,
  type ActivityInput,
} from '@/lib/db/activities';
import { createRule, setRuleActive, setSlotStatus, syncSlots, getSlot } from '@/lib/db/slots';
import { getOperatorId } from '@/lib/session';
import { isActivityCategory, type CapacityMode } from '@/lib/catalog';

export type ActivityFormState = { error?: string };

/** İşletmenin yalnızca kendi aktivitesine dokunabilmesini sağlar. */
async function assertOwnership(activityId: string) {
  const operatorId = await getOperatorId();
  if (!operatorId) return null;

  const activity = getActivityById(activityId);
  if (!activity || activity.operatorId !== operatorId) return null;
  return { operatorId, activity };
}

function readForm(formData: FormData, operatorId: string): ActivityInput | string {
  const title = String(formData.get('title') ?? '').trim();
  const category = String(formData.get('category') ?? '');
  const priceTRY = Number(formData.get('priceTRY'));
  const durationMinutes = Number(formData.get('durationMinutes'));
  const location = String(formData.get('location') ?? '').trim();
  const capacityMode = String(formData.get('capacityMode') ?? '') as CapacityMode;

  if (title.length < 3) return 'Başlık en az 3 karakter olmalı.';
  if (!isActivityCategory(category)) return 'Geçerli bir kategori seçin.';
  if (!Number.isFinite(priceTRY) || priceTRY < 0) return 'Geçerli bir fiyat girin.';
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return 'Geçerli bir süre girin.';
  if (location.length < 2) return 'Konum adı girin.';
  if (capacityMode !== 'per_person' && capacityMode !== 'per_booking') {
    return 'Kapasite sayım biçimini seçin.';
  }

  const latRaw = String(formData.get('lat') ?? '').trim();
  const lngRaw = String(formData.get('lng') ?? '').trim();
  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;
  if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) return 'Enlem geçersiz.';
  if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) return 'Boylam geçersiz.';

  const list = (name: string) =>
    String(formData.get(name) ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

  return {
    operatorId,
    slug: '',
    title,
    category,
    description: String(formData.get('description') ?? '').trim() || undefined,
    priceTRY: Math.round(priceTRY),
    durationMinutes,
    location,
    lat,
    lng,
    capacityMode,
    capacityLabel: String(formData.get('capacityLabel') ?? '').trim() || undefined,
    instantConfirm: formData.get('instantConfirm') === 'on',
    included: list('included'),
    safety: list('safety'),
  };
}

export async function createActivityAction(
  _prev: ActivityFormState,
  formData: FormData
): Promise<ActivityFormState> {
  const operatorId = await getOperatorId();
  if (!operatorId) return { error: 'Oturum sona ermiş. Tekrar giriş yapın.' };

  const input = readForm(formData, operatorId);
  if (typeof input === 'string') return { error: input };

  const activity = createActivity({ ...input, slug: uniqueSlug(input.title) });

  revalidatePath('/isletme/aktiviteler');
  redirect(`/isletme/aktiviteler/${activity.id}/takvim`);
}

export async function updateActivityAction(
  _prev: ActivityFormState,
  formData: FormData
): Promise<ActivityFormState> {
  const id = String(formData.get('id') ?? '');
  const owned = await assertOwnership(id);
  if (!owned) return { error: 'Bu aktiviteye erişim yetkiniz yok.' };

  const input = readForm(formData, owned.operatorId);
  if (typeof input === 'string') return { error: input };

  // Slug korunur: yayındaki bir adresin değişmesi bağlantıları kırar.
  updateActivity(id, {
    ...input,
    slug: owned.activity.slug,
    image: owned.activity.image || undefined,
    imageAlt: owned.activity.imageAlt || undefined,
    gallery: owned.activity.gallery,
    meetingPoint: owned.activity.meetingPoint,
    reviews: owned.activity.reviews,
    rating: owned.activity.rating,
    reviewCount: owned.activity.reviewCount,
    status: owned.activity.status,
  });

  revalidatePath('/isletme/aktiviteler');
  revalidatePath(`/aktivite/${owned.activity.slug}`);
  return {};
}

export async function toggleActivityStatusAction(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const owned = await assertOwnership(id);
  if (!owned) return;

  setActivityStatus(id, owned.activity.status === 'published' ? 'draft' : 'published');
  revalidatePath('/isletme/aktiviteler');
  revalidatePath('/');
}

export type ScheduleFormState = {
  error?: string;
  message?: string;
  /** Kural değişince rezervasyonu olduğu için korunan slot sayısı. */
  keptWithBookings?: number;
};

/**
 * Takvim kuralı ekler ve slotları üretir.
 *
 * Kullanıcının tarif ettiği alan budur: "08:00'dan 18:00'e, 15 dakikada bir,
 * her slotta 4 kişi".
 */
export async function createRuleAction(
  _prev: ScheduleFormState,
  formData: FormData
): Promise<ScheduleFormState> {
  const activityId = String(formData.get('activityId') ?? '');
  const owned = await assertOwnership(activityId);
  if (!owned) return { error: 'Bu aktiviteye erişim yetkiniz yok.' };

  const startTime = String(formData.get('startTime') ?? '');
  const endTime = String(formData.get('endTime') ?? '');
  const intervalMinutes = Number(formData.get('intervalMinutes'));
  const capacity = Number(formData.get('capacity'));

  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return { error: 'Başlangıç ve bitiş saatini girin.' };
  }
  if (startTime >= endTime) return { error: 'Bitiş saati başlangıçtan sonra olmalı.' };
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5) {
    return { error: 'Aralık en az 5 dakika olmalı.' };
  }
  if (!Number.isInteger(capacity) || capacity < 1) return { error: 'Kapasite en az 1 olmalı.' };

  // Seçilen günlerden 7 bitlik maske. Hiçbiri seçilmediyse her gün.
  let weekdays = 0;
  for (let i = 0; i < 7; i++) if (formData.get(`weekday-${i}`) === 'on') weekdays |= 1 << i;
  if (weekdays === 0) weekdays = 127;

  const today = new Date();
  const validFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  createRule({
    activityId,
    weekdays,
    startTime,
    endTime,
    intervalMinutes,
    capacity,
    validFrom,
    validUntil: null,
  });

  const { added, closed, keptWithBookings } = syncSlots(activityId);

  revalidatePath(`/isletme/aktiviteler/${activityId}/takvim`);
  return {
    message: `${added} slot eklendi${closed > 0 ? `, ${closed} slot kapatıldı` : ''}.`,
    keptWithBookings: keptWithBookings.length,
  };
}

export async function toggleRuleAction(formData: FormData) {
  const activityId = String(formData.get('activityId') ?? '');
  const ruleId = String(formData.get('ruleId') ?? '');
  const active = formData.get('active') === '1';

  const owned = await assertOwnership(activityId);
  if (!owned) return;

  setRuleActive(ruleId, active);
  syncSlots(activityId);
  revalidatePath(`/isletme/aktiviteler/${activityId}/takvim`);
}

/** Tek bir slotu kapatır ya da yeniden açar (bakım, hava koşulu vb.). */
export async function toggleSlotAction(formData: FormData) {
  const activityId = String(formData.get('activityId') ?? '');
  const slotId = String(formData.get('slotId') ?? '');

  const owned = await assertOwnership(activityId);
  if (!owned) return;

  const slot = getSlot(slotId);
  if (!slot || slot.activityId !== activityId) return;

  setSlotStatus(slotId, slot.status === 'open' ? 'closed' : 'open');
  revalidatePath(`/isletme/aktiviteler/${activityId}/takvim`);
}
