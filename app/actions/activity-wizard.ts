'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  createActivity,
  getActivityById,
  setActivityStatus,
  publishTargetFor,
  uniqueSlug,
  updateActivityFields,
} from '@/lib/db/activities';
import { createRule, setEquipmentPool, syncSlots, listRules } from '@/lib/db/slots';
import { listImages } from '@/lib/db/activity-images';
import { requireCapability, type OperatorSession } from '@/lib/auth';
import { isActivityCategory, type CapacityMode } from '@/lib/catalog';
import { record, type AuditAction } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';

/**
 * Aktivite oluşturma sihirbazının sunucu eylemleri.
 *
 * Sihirbazın var olma sebebi: bugün bir aktivitenin yayına girmesi için üç
 * ayrı ekrandan geçmek gerekiyor (form → takvim → görsel) ve bu sıra hiçbir
 * yerde yazmıyor. İşletme "Yayına Al" düğmesini kapalı buluyor ve sebebini
 * göremiyor.
 *
 * **Adım durumu adreste taşınıyor, istemcide değil.** Sebebi somut: birinci
 * adım veritabanına kayıt yazıyor. İstemci durumunda tutulsaydı tarayıcı
 * yenilendiğinde kayıt ortada kalır, kullanıcı baştan başlar ve her denemede
 * bir taslak daha birikirdi.
 *
 * Doğrulama kuralları `app/actions/activity.ts` içindeki `readForm` ile AYNI
 * olmak zorunda; bu yüzden oradan kopyalanmıyor, adım adım parçalanmış hâli
 * aşağıda tek yerde duruyor ve iki ekran da bunu çağırıyor.
 */

export type WizardState = { error?: string };

async function log(
  session: OperatorSession,
  action: AuditAction,
  activityId: string,
  meta?: Record<string, unknown>
) {
  await record({
    action,
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: session.operator.id,
    targetType: 'activity',
    targetId: activityId,
    ...(await requestContext()),
    meta: meta ?? null,
  });
}

/** Sihirbazın her adımı önce buradan geçer: yetki + sahiplik. */
async function ownStep(activityId: string) {
  const session = await requireCapability('aktivite.yonet');
  if (!session) return null;

  const activity = await getActivityById(activityId);
  if (!activity || activity.operatorId !== session.operator.id) return null;
  return { session, activity };
}

/**
 * Boş bırakılabilen sayısal eşik.
 *
 * Üç ayrı sonuç var ve üçü de farklı: boşsa `null` (kontrol yok), geçerli bir
 * pozitif sayıysa değeri, aksi hâlde `'invalid'`. Geçersiz girdiyi sessizce
 * `null`'a çevirmek en kötüsü olurdu — işletme sınır koyduğunu sanırdı.
 */
function optionalLimit(raw: FormDataEntryValue | null): number | null | 'invalid' {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return 'invalid';
  return value;
}

function step(activityId: string, adim: string): string {
  return `/isletme/aktiviteler/sihirbaz?aktivite=${activityId}&adim=${adim}`;
}

// --------------------------------------------------------------- 1. temel

export async function wizardBasicsAction(
  _prev: WizardState,
  formData: FormData
): Promise<WizardState> {
  const session = await requireCapability('aktivite.yonet');
  if (!session) return { error: 'Bu işlem için yetkiniz yok.' };

  const title = String(formData.get('title') ?? '').trim();
  const category = String(formData.get('category') ?? '');
  const priceTRY = Number(formData.get('priceTRY'));
  const durationMinutes = Number(formData.get('durationMinutes'));
  const capacityMode = String(formData.get('capacityMode') ?? '') as CapacityMode;

  // Mesajlar readForm ile birebir aynı: kullanıcı iki ekranda farklı cümle
  // görmemeli.
  if (title.length < 3) return { error: 'Başlık en az 3 karakter olmalı.' };
  if (!isActivityCategory(category)) return { error: 'Geçerli bir kategori seçin.' };
  if (!Number.isFinite(priceTRY) || priceTRY < 0) return { error: 'Geçerli bir fiyat girin.' };
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return { error: 'Geçerli bir süre girin.' };
  }
  if (capacityMode !== 'per_person' && capacityMode !== 'per_booking') {
    return { error: 'Kapasite sayım biçimini seçin.' };
  }

  const existingId = String(formData.get('aktivite') ?? '');

  // Geri dönüp düzeltmek yeni bir taslak AÇMAZ. Adres zaten bir aktivite
  // taşıyorsa üzerine yazılır; taşımıyorsa yaratılır.
  if (existingId) {
    const owned = await ownStep(existingId);
    if (!owned) return { error: 'Bu aktiviteye erişim yetkiniz yok.' };

    await updateActivityFields(existingId, {
      title,
      category,
      priceTRY: Math.round(priceTRY),
      durationMinutes,
      capacityMode,
    });
    await log(owned.session, 'activity.updated', existingId, { adim: 'temel' });
    revalidatePath('/isletme/aktiviteler');
    redirect(step(existingId, 'konum'));
  }

  const activity = await createActivity({
    operatorId: session.operator.id,
    slug: await uniqueSlug(title),
    title,
    category,
    priceTRY: Math.round(priceTRY),
    durationMinutes,
    // Konum bir sonraki adımda geliyor; taslak kaydın oluşabilmesi için
    // geçici bir yer tutucu yazılıyor ve `konum` adımı zorunlu tutuluyor.
    location: '',
    capacityMode,
  });

  await log(session, 'activity.created', activity.id, { slug: activity.slug, kaynak: 'sihirbaz' });
  revalidatePath('/isletme/aktiviteler');
  redirect(step(activity.id, 'konum'));
}

// --------------------------------------------------------------- 2. konum

export async function wizardLocationAction(
  _prev: WizardState,
  formData: FormData
): Promise<WizardState> {
  const id = String(formData.get('aktivite') ?? '');
  const owned = await ownStep(id);
  if (!owned) return { error: 'Bu aktiviteye erişim yetkiniz yok.' };

  const location = String(formData.get('location') ?? '').trim();
  if (location.length < 2) return { error: 'Konum adı girin.' };

  const latRaw = String(formData.get('lat') ?? '').trim();
  const lngRaw = String(formData.get('lng') ?? '').trim();
  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;
  if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
    return { error: 'Enlem geçersiz.' };
  }
  if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
    return { error: 'Boylam geçersiz.' };
  }

  await updateActivityFields(id, {
    location,
    lat,
    lng,
    description: String(formData.get('description') ?? '').trim() || undefined,
  });

  await log(owned.session, 'activity.updated', id, { adim: 'konum' });
  revalidatePath('/isletme/aktiviteler');
  redirect(step(id, 'takvim'));
}

// -------------------------------------------------------------- 3. takvim

/**
 * Takvim adımı: sınırlar + kural tek gönderimde.
 *
 * **Sıra önemli.** Hazırlık payı ÖNCE yazılıyor, kural SONRA ekleniyor:
 * slot üretimi hazırlık payını aktiviteden okuyor (`ruleTimes`) ve ters
 * sırada üretilen slotlar yanlış saatlerde açılırdı.
 */
export async function wizardScheduleAction(
  _prev: WizardState,
  formData: FormData
): Promise<WizardState> {
  const id = String(formData.get('aktivite') ?? '');
  const owned = await ownStep(id);
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

  const minParticipants = Number(formData.get('minParticipants') ?? 1);
  const bookingCutoffMinutes = Number(formData.get('bookingCutoffMinutes') ?? 0);
  const prepMinutes = Number(formData.get('prepMinutes') ?? 0);

  if (!Number.isInteger(minParticipants) || minParticipants < 1) {
    return { error: 'Minimum katılımcı en az 1 olmalı.' };
  }
  if (!Number.isInteger(bookingCutoffMinutes) || bookingCutoffMinutes < 0) {
    return { error: 'Son rezervasyon süresi negatif olamaz.' };
  }
  if (!Number.isInteger(prepMinutes) || prepMinutes < 0) {
    return { error: 'Hazırlık süresi negatif olamaz.' };
  }

  const poolName = String(formData.get('poolName') ?? '').trim();
  const unitCount = Number(formData.get('unitCount') ?? 0);
  const capacityPerUnit = Number(formData.get('capacityPerUnit') ?? 0);

  // Havuz ya tam ya hiç — yarım tanımlanmış bir havuz sessizce yok sayılırsa
  // işletme ekipman sınırı koyduğunu sanır.
  if (poolName) {
    if (!Number.isInteger(unitCount) || unitCount < 1) {
      return { error: 'Ekipman sayısı en az 1 olmalı.' };
    }
    if (!Number.isInteger(capacityPerUnit) || capacityPerUnit < 1) {
      return { error: 'Ekipman başına kapasite en az 1 olmalı.' };
    }
  }

  // Hava eşikleri. Boş bırakılan alan **null** olur ve null "kontrol yok"
  // demektir; 0 yazmak "sıfır rüzgârda bile elverişsiz" anlamına gelirdi, bu
  // yüzden pozitif olmayan değer kabul edilmiyor.
  const windLimitKmh = optionalLimit(formData.get('windLimitKmh'));
  const gustLimitKmh = optionalLimit(formData.get('gustLimitKmh'));
  const waveLimitM = optionalLimit(formData.get('waveLimitM'));

  if (windLimitKmh === 'invalid' || gustLimitKmh === 'invalid' || waveLimitM === 'invalid') {
    return { error: 'Hava sınırları boş bırakılabilir ama girilirse sıfırdan büyük olmalı.' };
  }

  await updateActivityFields(id, {
    minParticipants,
    bookingCutoffMinutes,
    prepMinutes,
    windLimitKmh,
    gustLimitKmh,
    waveLimitM,
  });
  await setEquipmentPool(id, poolName ? { name: poolName, unitCount, capacityPerUnit } : null);

  let weekdays = 0;
  for (let i = 0; i < 7; i++) if (formData.get(`weekday-${i}`) === 'on') weekdays |= 1 << i;
  if (weekdays === 0) weekdays = 127;

  const today = new Date();
  const validFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;

  const rule = await createRule({
    activityId: id,
    weekdays,
    startTime,
    endTime,
    intervalMinutes,
    capacity,
    validFrom,
    validUntil: null,
  });

  const { added } = await syncSlots(id);

  await log(owned.session, 'schedule.rule_created', id, {
    ruleId: rule.id,
    added,
    prepMinutes,
    kaynak: 'sihirbaz',
  });

  revalidatePath(`/isletme/aktiviteler/${id}/takvim`);
  redirect(step(id, 'gorseller'));
}

// ------------------------------------------------------------- 5. yayına al

export type PublishCheck = {
  ready: boolean;
  missing: string[];
};

/**
 * Yayına hazır mı — eksikler İSİMLE dönüyor.
 *
 * Bugün aktivite listesindeki "Yayına Al" düğmesi takvim kuralı yoksa sessizce
 * kapalı (`aktiviteler/page.tsx`). Kullanıcı sebebini göremiyor; sihirbazın son
 * adımı tam olarak bu soruyu cevaplamak için var.
 */
export async function publishChecklist(activityId: string): Promise<PublishCheck> {
  const activity = await getActivityById(activityId);
  if (!activity) return { ready: false, missing: ['Aktivite bulunamadı.'] };

  const missing: string[] = [];
  if (!activity.location || activity.location.length < 2) missing.push('Konum girilmedi.');

  const rules = await listRules(activityId);
  if (rules.filter((r) => r.active).length === 0) missing.push('Takvim kuralı tanımlanmadı.');

  const images = await listImages(activityId);
  if (images.length === 0) missing.push('En az bir görsel yüklenmedi.');

  return { ready: missing.length === 0, missing };
}

export async function wizardPublishAction(
  _prev: WizardState,
  formData: FormData
): Promise<WizardState> {
  const id = String(formData.get('aktivite') ?? '');
  const owned = await ownStep(id);
  if (!owned) return { error: 'Bu aktiviteye erişim yetkiniz yok.' };

  // Kontrol listesi arayüzde de gösteriliyor ama karar BURADA veriliyor:
  // düğmeyi gizlemek yetkilendirme olmadığı gibi, doğrulama da değil.
  const check = await publishChecklist(id);
  if (!check.ready) return { error: check.missing.join(' ') };

  const target = publishTargetFor(owned.session.operator.verificationStatus);
  await setActivityStatus(id, target);
  await log(owned.session, 'activity.published', id, {
    slug: owned.activity.slug,
    durum: target,
    kaynak: 'sihirbaz',
  });

  revalidatePath('/isletme/aktiviteler');
  revalidatePath('/');
  redirect(`/isletme/aktiviteler?yeni=${id}`);
}
