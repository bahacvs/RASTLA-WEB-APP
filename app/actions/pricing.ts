'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { getActivityById } from '@/lib/db/activities';
import {
  createPriceRule,
  deleteGroupDiscount,
  deletePriceRule,
  upsertGroupDiscount,
} from '@/lib/db/pricing';

/**
 * Fiyat kuralları ve grup indirimleri — işletme tarafı.
 *
 * Yetki `aktivite.yonet`: ilanın liste fiyatını değiştirebilen kişi zaten
 * aynı yetkiyle giriyor (`ActivityForm`). Kural için daha dar bir yetki
 * tanımlamak, aynı kararı iki farklı kapıdan geçirmek olurdu — biri
 * kapatılsa diğerinden aynı sonuca varılırdı. Saha personelinde bu yetki yok.
 */

export type PricingState = { error?: string; message?: string };

/**
 * Aktivitenin bu işletmeye ait olduğunu doğrular.
 *
 * Sahiplik SUNUCUDA sınanıyor: form alanındaki `activityId` istemciden
 * geliyor ve değiştirilebilir. Kontrol olmasaydı bir işletme başka bir
 * işletmenin fiyatını değiştirebilirdi.
 */
async function ownedActivity(activityId: string) {
  const session = await requireCapability('aktivite.yonet');
  if (!session) return null;

  const activity = await getActivityById(activityId);
  if (!activity || activity.operatorId !== session.operator.id) return null;

  return activity;
}

/** HH:MM biçimi; boş bırakılabilir (tüm gün demek). */
function readTime(raw: FormDataEntryValue | null): string | null | 'invalid' {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : 'invalid';
}

/** YYYY-MM-DD biçimi; boş bırakılabilir (sınırsız demek). */
function readDate(raw: FormDataEntryValue | null): string | null | 'invalid' {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : 'invalid';
}

export async function savePriceRuleAction(
  _prev: PricingState,
  formData: FormData
): Promise<PricingState> {
  const activityId = String(formData.get('activityId') ?? '');
  const activity = await ownedActivity(activityId);
  if (!activity) return { error: 'Bu ilana erişim yetkiniz yok.' };

  const label = String(formData.get('label') ?? '').trim();
  if (label.length < 2) return { error: 'Kurala bir ad verin (örn. "Cumartesi tarifesi").' };

  const priceTRY = Number(formData.get('priceTRY'));
  if (!Number.isFinite(priceTRY) || priceTRY < 0) return { error: 'Geçerli bir fiyat girin.' };

  const validFrom = readDate(formData.get('validFrom'));
  const validUntil = readDate(formData.get('validUntil'));
  if (validFrom === 'invalid' || validUntil === 'invalid') {
    return { error: 'Tarihler GG.AA.YYYY biçiminde seçilmeli.' };
  }
  // Ters aralık sessizce hiçbir güne uymayan bir kural üretirdi: işletme
  // kuralı listede görür ama fiyat hiç değişmez ve sebebini bulamaz.
  if (validFrom && validUntil && validFrom > validUntil) {
    return { error: 'Bitiş tarihi başlangıçtan önce olamaz.' };
  }

  const startTime = readTime(formData.get('startTime'));
  const endTime = readTime(formData.get('endTime'));
  if (startTime === 'invalid' || endTime === 'invalid') {
    return { error: 'Saatler SS:DD biçiminde girilmeli.' };
  }
  if (startTime && endTime && startTime >= endTime) {
    return { error: 'Bitiş saati başlangıçtan sonra olmalı.' };
  }

  // Gün maskesi: hiç gün seçilmediyse kural hiçbir zaman çalışmaz. Şemadaki
  // CHECK bunu zaten reddediyor; burada anlaşılır bir cümleyle karşılanıyor.
  let weekdays = 0;
  for (let i = 0; i < 7; i++) {
    if (formData.get(`weekday${i}`) === 'on') weekdays |= 1 << i;
  }
  if (weekdays === 0) return { error: 'En az bir gün seçin.' };

  const priority = Number(formData.get('priority') ?? 0);
  if (!Number.isFinite(priority) || priority < 0 || priority > 100) {
    return { error: 'Öncelik 0 ile 100 arasında olmalı.' };
  }

  await createPriceRule({
    activityId: activity.id,
    label,
    priority: Math.round(priority),
    validFrom,
    validUntil,
    weekdays,
    startTime,
    endTime,
    priceTRY: Math.round(priceTRY),
  });

  revalidatePath(`/isletme/aktiviteler/${activity.id}/fiyat`);
  revalidatePath(`/rezervasyon/${activity.slug}`);
  return { message: 'Fiyat kuralı eklendi.' };
}

export async function deletePriceRuleAction(
  _prev: PricingState,
  formData: FormData
): Promise<PricingState> {
  const activityId = String(formData.get('activityId') ?? '');
  const activity = await ownedActivity(activityId);
  if (!activity) return { error: 'Bu ilana erişim yetkiniz yok.' };

  const ok = await deletePriceRule(String(formData.get('id') ?? ''), activity.id);
  if (!ok) return { error: 'Kural bulunamadı.' };

  revalidatePath(`/isletme/aktiviteler/${activity.id}/fiyat`);
  revalidatePath(`/rezervasyon/${activity.slug}`);
  return { message: 'Kural silindi.' };
}

export async function saveGroupDiscountAction(
  _prev: PricingState,
  formData: FormData
): Promise<PricingState> {
  const activityId = String(formData.get('activityId') ?? '');
  const activity = await ownedActivity(activityId);
  if (!activity) return { error: 'Bu ilana erişim yetkiniz yok.' };

  const minPeople = Number(formData.get('minPeople'));
  if (!Number.isFinite(minPeople) || minPeople < 2) {
    return { error: 'Grup indirimi en az 2 kişiden başlar.' };
  }

  const percent = Number(formData.get('percent'));
  // Üst sınır 50: daha fazlası neredeyse her zaman bir yazım hatası (%5 yerine
  // %50) ve fark ancak gün sonunda fark edilirdi. Şemadaki CHECK ile aynı.
  if (!Number.isFinite(percent) || percent < 1 || percent > 50) {
    return { error: 'İndirim %1 ile %50 arasında olmalı.' };
  }

  await upsertGroupDiscount({
    activityId: activity.id,
    minPeople: Math.round(minPeople),
    percent: Math.round(percent),
  });

  revalidatePath(`/isletme/aktiviteler/${activity.id}/fiyat`);
  revalidatePath(`/rezervasyon/${activity.slug}`);
  return { message: 'Grup indirimi kaydedildi.' };
}

export async function deleteGroupDiscountAction(
  _prev: PricingState,
  formData: FormData
): Promise<PricingState> {
  const activityId = String(formData.get('activityId') ?? '');
  const activity = await ownedActivity(activityId);
  if (!activity) return { error: 'Bu ilana erişim yetkiniz yok.' };

  const ok = await deleteGroupDiscount(String(formData.get('id') ?? ''), activity.id);
  if (!ok) return { error: 'İndirim bulunamadı.' };

  revalidatePath(`/isletme/aktiviteler/${activity.id}/fiyat`);
  revalidatePath(`/rezervasyon/${activity.slug}`);
  return { message: 'İndirim silindi.' };
}
