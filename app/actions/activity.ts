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
  type ActivityInput,
} from '@/lib/db/activities';
import {
  createRule,
  setEquipmentPool,
  setRuleActive,
  setSlotStatus,
  syncSlots,
  getSlot,
} from '@/lib/db/slots';
import { requireCapability, type OperatorSession } from '@/lib/auth';
import { isActivityCategory, type CapacityMode } from '@/lib/catalog';
import { record, type AuditAction } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';

export type ActivityFormState = { error?: string };

/** Katalog değişikliklerini günlüğe yazar — hepsi aynı biçimde. */
async function log(
  session: OperatorSession,
  action: AuditAction,
  targetType: string,
  targetId: string,
  meta?: Record<string, unknown>
) {
  await record({
    action,
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: session.operator.id,
    targetType,
    targetId,
    ...(await requestContext()),
    meta: meta ?? null,
  });
}

/**
 * Aktivite yönetimi sahip ve yöneticiye açıktır, saha personeline kapalı.
 *
 * Saha personeli bilet okutur ve günün rezervasyonlarını görür; fiyat
 * değiştirmek, takvim tanımlamak ve yayına almak ticari kararlardır ve sahilde
 * telefonla çalışan birinin işi değildir.
 *
 * Kontrol her eylemde sunucu tarafında yapılır — bağlantıyı menüden gizlemek
 * yetkilendirme değildir.
 */
async function requireActivityAccess() {
  return requireCapability('aktivite.yonet');
}

/** Sahibin yalnızca kendi aktivitesine dokunabilmesini sağlar. */
async function assertOwnership(activityId: string) {
  const session = await requireActivityAccess();
  if (!session) return null;

  const activity = await getActivityById(activityId);
  if (!activity || activity.operatorId !== session.operator.id) return null;
  return { operatorId: session.operator.id, activity, session };
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
  const session = await requireActivityAccess();
  if (!session) return { error: 'Bu işlem için işletme sahibi yetkisi gerekir.' };

  const input = readForm(formData, session.operator.id);
  if (typeof input === 'string') return { error: input };

  const activity = await createActivity({ ...input, slug: await uniqueSlug(input.title) });
  await log(session, 'activity.created', 'activity', activity.id, { slug: activity.slug });

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

  // YALNIZCA bu formun sahip olduğu alanlar yazılıyor.
  //
  // Önce tam satır UPDATE'i (`updateActivity`) kullanılıyordu ve çağıran taraf
  // dokunmadığı alanları elle geri yazmak zorundaydı: görsel, galeri, puan,
  // durum hepsi tek tek korunuyordu. Korunmayan üç alan vardı — minimum
  // katılımcı, rezervasyon kesiti ve hazırlık payı — çünkü onlar başka bir
  // ekranda (takvim) giriliyor ve bu formda hiç görünmüyorlar. Sonuç: bir
  // aktivitenin BAŞLIĞINI değiştirmek, takvim ekranında girilmiş operasyon
  // sınırlarını sessizce varsayılana döndürüyordu (ölçüldü: min 3 → 1,
  // kesit 60 → 0, hazırlık 5 → 0 dk — ve hazırlık payının değişmesi slot
  // saatlerini de kaydırır).
  //
  // Alanları tek tek korumaya devam etmek hatanın kendisini değil o günkü
  // örneğini düzeltirdi: eklenen HER yeni sütun aynı tuzağı yeniden kurardı.
  // Bu yüzden form artık yalnızca kendi alanlarını yamalıyor; bilmediği hiçbir
  // sütuna dokunmuyor. Slug da kasten dışarıda: yayındaki bir adresin
  // değişmesi bağlantıları kırar.
  await updateActivityFields(id, {
    title: input.title,
    category: input.category,
    description: input.description,
    priceTRY: input.priceTRY,
    durationMinutes: input.durationMinutes,
    location: input.location,
    lat: input.lat,
    lng: input.lng,
    capacityMode: input.capacityMode,
    capacityLabel: input.capacityLabel,
    instantConfirm: input.instantConfirm,
    included: input.included,
    safety: input.safety,
  });

  await log(owned.session, 'activity.updated', 'activity', id, {
    // Fiyat değişikliği uyuşmazlıkta en çok sorulan şey; eski ve yeni değer
    // birlikte tutulur.
    priceBefore: owned.activity.priceTRY,
    priceAfter: input.priceTRY,
  });

  revalidatePath('/isletme/aktiviteler');
  revalidatePath(`/aktivite/${owned.activity.slug}`);
  return {};
}

export async function toggleActivityStatusAction(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const owned = await assertOwnership(id);
  if (!owned) return;

  // Yayında ya da incelemede olan bir ilan taslağa döner; taslak ise yayına
  // verilir. "İncelemedeyken tekrar bas" geri çekmek anlamına geliyor ve
  // olması gereken bu: işletme kendi ilanını kuyruktan çekebilmeli.
  const publishing = owned.activity.status === 'draft';

  // Doğrulanmamış işletmenin ilanı doğrudan yayına ÇIKMAZ, incelemeye düşer.
  const target = publishing
    ? publishTargetFor(owned.session.operator.verificationStatus)
    : 'draft';

  await setActivityStatus(id, target);
  await log(
    owned.session,
    publishing ? 'activity.published' : 'activity.unpublished',
    'activity',
    id,
    { slug: owned.activity.slug, durum: target }
  );

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

  await createRule({
    activityId,
    weekdays,
    startTime,
    endTime,
    intervalMinutes,
    capacity,
    validFrom,
    validUntil: null,
  });

  const { added, closed, keptWithBookings } = await syncSlots(activityId);

  await log(owned.session, 'schedule.rule_created', 'activity', activityId, {
    startTime,
    endTime,
    intervalMinutes,
    capacity,
    weekdays,
    added,
    closed,
    keptWithBookings: keptWithBookings.length,
  });

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

  await setRuleActive(ruleId, active);
  const { added, closed } = await syncSlots(activityId);
  await log(owned.session, 'schedule.rule_toggled', 'schedule_rule', ruleId, {
    activityId,
    active,
    added,
    closed,
  });

  revalidatePath(`/isletme/aktiviteler/${activityId}/takvim`);
}

/** Tek bir slotu kapatır ya da yeniden açar (bakım, hava koşulu vb.). */
export async function toggleSlotAction(formData: FormData) {
  const activityId = String(formData.get('activityId') ?? '');
  const slotId = String(formData.get('slotId') ?? '');

  const owned = await assertOwnership(activityId);
  if (!owned) return;

  const slot = await getSlot(slotId);
  if (!slot || slot.activityId !== activityId) return;

  const next = slot.status === 'open' ? 'closed' : 'open';
  await setSlotStatus(slotId, next);
  await log(owned.session, 'schedule.slot_toggled', 'slot', slotId, {
    activityId,
    date: slot.date,
    time: slot.time,
    status: next,
  });

  revalidatePath(`/isletme/aktiviteler/${activityId}/takvim`);
}

/**
 * Boş bırakılabilen sayısal eşik.
 *
 * Üç ayrı sonuç ve üçü de farklı: boşsa `null` (kontrol yok), pozitif bir
 * sayıysa değeri, aksi hâlde `'invalid'`.
 */
function optionalLimit(raw: FormDataEntryValue | null): number | null | 'invalid' {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return 'invalid';
  return value;
}

export type LimitsFormState = { error?: string; message?: string };

/**
 * Operasyon sınırları: minimum katılımcı, son rezervasyon kesiti, hazırlık
 * süresi ve ekipman havuzu.
 *
 * Takvim kuralından AYRI tutuluyor çünkü ikisi farklı şeyler tanımlıyor.
 * Kural bir tercihtir ("sabah 8'den akşam 6'ya çalışırım"); bunlar ise
 * aktivitenin fiziksel gerçeğidir ("3 jet skim var, her biri 2 kişilik,
 * arada 5 dakika hazırlık gerekiyor"). Aynı forma sıkıştırılsalardı, saati
 * değiştirmek isteyen kişi araç sayısını da yeniden girmek zorunda kalırdı.
 *
 * Hazırlık süresi değişince slotlar yeniden eşitlenir: aralık değişmiş olur
 * ve mevcut slotlar artık kuralı yansıtmaz.
 */
export async function saveLimitsAction(
  _prev: LimitsFormState,
  formData: FormData
): Promise<LimitsFormState> {
  const activityId = String(formData.get('activityId') ?? '');
  const owned = await assertOwnership(activityId);
  if (!owned) return { error: 'Bu aktiviteye erişim yetkiniz yok.' };

  const minParticipants = Number(formData.get('minParticipants'));
  const cutoff = Number(formData.get('bookingCutoffMinutes'));
  const prep = Number(formData.get('prepMinutes'));

  if (!Number.isInteger(minParticipants) || minParticipants < 1) {
    return { error: 'Minimum katılımcı en az 1 olmalı.' };
  }
  if (!Number.isInteger(cutoff) || cutoff < 0) return { error: 'Kesit negatif olamaz.' };
  if (!Number.isInteger(prep) || prep < 0) return { error: 'Hazırlık süresi negatif olamaz.' };

  // Hava eşikleri boş bırakılabilir; boş = KONTROL YOK. Geçersiz bir girdiyi
  // sessizce boşa çevirmek en kötüsü olurdu — işletme sınır koyduğunu sanırdı.
  const wind = optionalLimit(formData.get('windLimitKmh'));
  const gust = optionalLimit(formData.get('gustLimitKmh'));
  const wave = optionalLimit(formData.get('waveLimitM'));
  if (wind === 'invalid' || gust === 'invalid' || wave === 'invalid') {
    return { error: 'Hava sınırları boş bırakılabilir ama girilirse sıfırdan büyük olmalı.' };
  }

  const poolName = String(formData.get('poolName') ?? '').trim();
  const unitCount = Number(formData.get('unitCount'));
  const capacityPerUnit = Number(formData.get('capacityPerUnit'));

  // Havuz ya tam tanımlanır ya hiç. Yarım tanım (adı var sayısı yok) sessizce
  // sınırsız kapasiteye dönüşürdü ve bu, aşırı rezervasyonun sebebi olurdu.
  const wantsPool = poolName.length > 0;
  if (wantsPool) {
    if (!Number.isInteger(unitCount) || unitCount < 1) {
      return { error: 'Ekipman sayısı en az 1 olmalı.' };
    }
    if (!Number.isInteger(capacityPerUnit) || capacityPerUnit < 1) {
      return { error: 'Ekipman başına kapasite en az 1 olmalı.' };
    }
  }

  await updateActivityFields(activityId, {
    minParticipants,
    bookingCutoffMinutes: cutoff,
    prepMinutes: prep,
    windLimitKmh: wind,
    gustLimitKmh: gust,
    waveLimitM: wave,
  });

  await setEquipmentPool(
    activityId,
    wantsPool ? { name: poolName, unitCount, capacityPerUnit } : null
  );

  // Hazırlık süresi seans aralığını değiştirir; slotlar buna göre yenilenir.
  const sync = await syncSlots(activityId);

  await log(owned.session, 'activity.updated', 'activity', activityId, {
    minParticipants,
    bookingCutoffMinutes: cutoff,
    prepMinutes: prep,
    equipment: wantsPool ? `${poolName} ${unitCount}x${capacityPerUnit}` : null,
  });

  revalidatePath(`/isletme/aktiviteler/${activityId}/takvim`);
  return {
    message:
      sync.keptWithBookings.length > 0
        ? `Kaydedildi. ${sync.keptWithBookings.length} slot rezervasyonu olduğu için korundu.`
        : 'Kaydedildi.',
  };
}
