import { randomUUID } from 'node:crypto';
import { db, toCount } from './index.mjs';
import type {
  Activity,
  ActivityCategory,
  ActivityStatus,
  CapacityMode,
  Review,
} from '../catalog';

/**
 * Aktivite deposu.
 *
 * Aktiviteler eskiden `lib/data.ts` içinde sabit bir diziydi. İşletmenin
 * kendi aktivitesini ekleyebilmesi için veritabanına taşındı. Sunucu tarafına
 * özeldir — istemci bileşenleri bu dosyayı içe aktaramaz.
 */

type Row = {
  id: string;
  operator_id: string;
  slug: string;
  title: string;
  category: ActivityCategory;
  description: string | null;
  price_try: number;
  duration_minutes: number;
  location_name: string;
  lat: number | null;
  lng: number | null;
  branch_id: string | null;
  capacity_mode: CapacityMode;
  min_participants: number;
  booking_cutoff_minutes: number;
  prep_minutes: number;
  wind_limit_kmh: number | null;
  gust_limit_kmh: number | null;
  wave_limit_m: number | null;
  image: string | null;
  image_alt: string | null;
  included: string | null;
  safety: string | null;
  gallery: string | null;
  meeting_point: string | null;
  reviews: string | null;
  capacity_label: string | null;
  instant_confirm: number;
  rating: number;
  review_count: number;
  status: ActivityStatus;
  /**
   * SUM() sonucu. Postgres bunu bigint döndürür ve `pg` sürücüsü DİZGİ olarak
   * verir; bu yüzden tip burada number değil ve toActivity içinde çevrilir.
   */
  remaining_today?: number | string;
};

function parseJson<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

/** Dakikayı arayüzde görünen süre etiketine çevirir: 30 -> "30 Dk", 120 -> "2 Saat". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} Dk`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} Saat` : `${minutes} Dk`;
}

/**
 * Postgres REAL sütununu sürücü DİZGİ olarak verebiliyor. Açık dönüştürme
 * yapılmazsa eşik `"35"` olarak gelir ve `value >= limit` karşılaştırması
 * sayı-dizgi karışımına düşerdi.
 */
function limit(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toActivity(row: Row): Activity {
  return {
    id: row.id,
    operatorId: row.operator_id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    description: row.description ?? undefined,
    priceTRY: row.price_try,
    durationMinutes: row.duration_minutes,
    durationLabel: durationLabel(row.duration_minutes),
    location: row.location_name,
    lat: row.lat,
    lng: row.lng,
    branchId: row.branch_id ?? null,
    capacityMode: row.capacity_mode,
    minParticipants: row.min_participants ?? 1,
    bookingCutoffMinutes: row.booking_cutoff_minutes ?? 0,
    prepMinutes: row.prep_minutes ?? 0,
    windLimitKmh: limit(row.wind_limit_kmh),
    gustLimitKmh: limit(row.gust_limit_kmh),
    waveLimitM: limit(row.wave_limit_m),
    image: row.image ?? '',
    imageAlt: row.image_alt ?? '',
    included: parseJson<string[]>(row.included),
    safety: parseJson<string[]>(row.safety),
    gallery: parseJson<{ src: string; alt: string }[]>(row.gallery),
    meetingPoint: parseJson<{ image: string; alt: string }>(row.meeting_point),
    reviews: parseJson<Review[]>(row.reviews),
    capacityLabel: row.capacity_label ?? undefined,
    instantConfirm: row.instant_confirm === 1,
    rating: row.rating,
    reviewCount: row.review_count,
    status: row.status,
    remainingToday: row.remaining_today === undefined ? undefined : toCount(row.remaining_today),
  };
}

const SELECT = 'SELECT * FROM activities';

/** Bugünün tarihi, YYYY-MM-DD. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Yayındaki aktiviteler. Her kayda bugün için kalan toplam yer eklenir —
 * listedeki "son N yer" uyarısı böylece gerçek doluluğu yansıtır.
 * Tek sorguda alt sorguyla hesaplanır; aktivite başına ek sorgu yapılmaz.
 */
export async function listPublishedActivities(): Promise<Activity[]> {
  const rows = await (
    await db()
  ).all<Row>(
    `SELECT a.*,
            (SELECT COALESCE(SUM(s.capacity - s.booked), 0)
               FROM slots s
              WHERE s.activity_id = a.id AND s.slot_date = ? AND s.status = 'open'
            ) AS remaining_today
       FROM activities a
      WHERE a.status = 'published'
      ORDER BY a.created_at`,
    [todayIso()]
  );
  return rows.map(toActivity);
}

export async function listActivitiesForOperator(operatorId: string): Promise<Activity[]> {
  const rows = await (
    await db()
  ).all<Row>(`${SELECT} WHERE operator_id = ? ORDER BY created_at DESC`, [operatorId]);
  return rows.map(toActivity);
}

export async function getActivityBySlug(slug: string): Promise<Activity | null> {
  const row = await (await db()).get<Row>(`${SELECT} WHERE slug = ?`, [slug]);
  return row ? toActivity(row) : null;
}

export async function getActivityById(id: string): Promise<Activity | null> {
  const row = await (await db()).get<Row>(`${SELECT} WHERE id = ?`, [id]);
  return row ? toActivity(row) : null;
}

export type ActivityInput = {
  operatorId: string;
  slug: string;
  title: string;
  category: ActivityCategory;
  description?: string;
  priceTRY: number;
  durationMinutes: number;
  location: string;
  lat?: number | null;
  lng?: number | null;
  branchId?: string | null;
  capacityMode: CapacityMode;
  minParticipants?: number;
  bookingCutoffMinutes?: number;
  prepMinutes?: number;
  windLimitKmh?: number | null;
  gustLimitKmh?: number | null;
  waveLimitM?: number | null;
  capacityLabel?: string;
  instantConfirm?: boolean;
  image?: string;
  imageAlt?: string;
  included?: string[];
  safety?: string[];
  gallery?: { src: string; alt: string }[];
  meetingPoint?: { image: string; alt: string };
  reviews?: Review[];
  rating?: number;
  reviewCount?: number;
  status?: ActivityStatus;
};

function toParams(input: ActivityInput) {
  return {
    operator_id: input.operatorId,
    slug: input.slug,
    title: input.title,
    category: input.category,
    description: input.description ?? null,
    price_try: input.priceTRY,
    duration_minutes: input.durationMinutes,
    location_name: input.location,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    branch_id: input.branchId ?? null,
    capacity_mode: input.capacityMode,
    min_participants: input.minParticipants ?? 1,
    booking_cutoff_minutes: input.bookingCutoffMinutes ?? 0,
    prep_minutes: input.prepMinutes ?? 0,
    wind_limit_kmh: input.windLimitKmh ?? null,
    gust_limit_kmh: input.gustLimitKmh ?? null,
    wave_limit_m: input.waveLimitM ?? null,
    image: input.image ?? null,
    image_alt: input.imageAlt ?? null,
    included: input.included ? JSON.stringify(input.included) : null,
    safety: input.safety ? JSON.stringify(input.safety) : null,
    gallery: input.gallery ? JSON.stringify(input.gallery) : null,
    meeting_point: input.meetingPoint ? JSON.stringify(input.meetingPoint) : null,
    reviews: input.reviews ? JSON.stringify(input.reviews) : null,
    capacity_label: input.capacityLabel ?? null,
    instant_confirm: input.instantConfirm ? 1 : 0,
    rating: input.rating ?? 0,
    review_count: input.reviewCount ?? 0,
    status: input.status ?? 'draft',
  };
}

export async function createActivity(input: ActivityInput): Promise<Activity> {
  const id = randomUUID();

  await (
    await db()
  ).run(
    `INSERT INTO activities
         (id, operator_id, slug, title, category, description, price_try, duration_minutes,
          location_name, lat, lng, branch_id, capacity_mode, min_participants, booking_cutoff_minutes,
          prep_minutes, wind_limit_kmh, gust_limit_kmh, wave_limit_m,
          image, image_alt, included, safety,
          gallery, meeting_point, reviews, capacity_label, instant_confirm, rating, review_count,
          status, created_at)
       VALUES
         (@id, @operator_id, @slug, @title, @category, @description, @price_try, @duration_minutes,
          @location_name, @lat, @lng, @branch_id, @capacity_mode, @min_participants, @booking_cutoff_minutes,
          @prep_minutes, @wind_limit_kmh, @gust_limit_kmh, @wave_limit_m,
          @image, @image_alt, @included, @safety,
          @gallery, @meeting_point, @reviews, @capacity_label, @instant_confirm, @rating, @review_count,
          @status, @created_at)`,
    { id, ...toParams(input), created_at: new Date().toISOString() }
  );

  return (await getActivityById(id))!;
}

/**
 * Yalnızca verilen alanları günceller. **Aktiviteyi güncellemenin tek yolu.**
 *
 * Eskiden bir de tam satır yazan `updateActivity` vardı ve çağıranı
 * dokunmadığı alanları geri yazmaya zorluyordu: görsel, galeri, puan, durum
 * tek tek okunup yeniden veriliyordu. Elle korunması unutulan alanlar sessizce
 * varsayılana dönüyordu — düzenleme formundan başlık değiştirmek, takvim
 * ekranında girilmiş minimum katılımcıyı, rezervasyon kesitini ve hazırlık
 * payını sıfırlıyordu (ölçüldü: 3 → 1, 60 → 0, 5 → 0 dk). Unutulan alanları
 * eklemek hatanın örneğini düzeltirdi, kendisini değil: eklenen her yeni sütun
 * aynı tuzağı yeniden kurardı. Bu yüzden tam satır yazan işlev kaldırıldı.
 *
 * Alan adları **beyaz listeden** geçiyor: anahtar doğrudan SQL'e gömülüyor ve
 * çağıran taraf `Partial<ActivityInput>` versе de, listede olmayan bir ad
 * sorguya giremez.
 */
const PATCHABLE = {
  title: 'title',
  category: 'category',
  description: 'description',
  priceTRY: 'price_try',
  durationMinutes: 'duration_minutes',
  location: 'location_name',
  lat: 'lat',
  lng: 'lng',
  branchId: 'branch_id',
  capacityMode: 'capacity_mode',
  minParticipants: 'min_participants',
  bookingCutoffMinutes: 'booking_cutoff_minutes',
  prepMinutes: 'prep_minutes',
  windLimitKmh: 'wind_limit_kmh',
  gustLimitKmh: 'gust_limit_kmh',
  waveLimitM: 'wave_limit_m',
  capacityLabel: 'capacity_label',
  instantConfirm: 'instant_confirm',
  included: 'included',
  safety: 'safety',
} as const satisfies Partial<Record<keyof ActivityInput, string>>;

type PatchableKey = keyof typeof PATCHABLE;

export async function updateActivityFields(
  id: string,
  patch: Partial<Pick<ActivityInput, PatchableKey>>
): Promise<Activity | null> {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  for (const [key, column] of Object.entries(PATCHABLE) as [PatchableKey, string][]) {
    if (!(key in patch)) continue;
    const value = patch[key];

    sets.push(`${column} = @${column}`);
    params[column] =
      key === 'instantConfirm'
        ? value
          ? 1
          : 0
        : key === 'included' || key === 'safety'
          ? JSON.stringify(value ?? [])
          : (value ?? null);
  }

  if (sets.length === 0) return getActivityById(id);

  await (await db()).run(`UPDATE activities SET ${sets.join(', ')} WHERE id = @id`, params);
  return getActivityById(id);
}

export async function setActivityStatus(id: string, status: ActivityStatus) {
  await (await db()).run('UPDATE activities SET status = ? WHERE id = ?', [status, id]);
}

/**
 * İşletme ilanı yayına vermek istediğinde varılacak durum.
 *
 * **Doğrulanmamış işletmenin ilanı doğrudan yayına çıkmaz**, RASTLA
 * incelemesine düşer. Doğrulanmış işletme doğrudan yayına çıkar.
 *
 * Alternatif — her ilanı tek tek incelemek — bilinçli olarak seçilmedi:
 * kontrolün konusu ilan metni değil İŞLETMENİN KENDİSİ, ve o kontrol bir kez
 * yapılıyor. Her ilanı incelemek, doğrulanmış bir işletmeyi fiyat
 * değiştirdiği için yeniden kuyruğa sokmak olurdu; ölçeklenmez ve incelemeyi
 * bir onay damgasına indirger. Öte yandan hiç doğrulanmamış bir işletmenin
 * ilanının kontrolsüz yayına çıkması, rozetle verilen güvenceyi boşa
 * çıkarırdı.
 */
export function publishTargetFor(verificationStatus: string): ActivityStatus {
  return verificationStatus === 'dogrulandi' ? 'published' : 'pending_review';
}

/** RASTLA incelemesini bekleyen ilanlar — /yonetim kuyruğu. */
export async function listPendingReview(): Promise<Activity[]> {
  const rows = await (
    await db()
  ).all<Row>(`SELECT * FROM activities WHERE status = 'pending_review' ORDER BY created_at`);
  return rows.map(toActivity);
}

/** Başlıktan URL'e uygun bir slug türetir; çakışırsa sonuna sayı ekler. */
export async function uniqueSlug(title: string): Promise<string> {
  const base =
    title
      .toLocaleLowerCase('tr-TR')
      .replaceAll('ı', 'i')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'aktivite';

  const client = await db();
  let slug = base;
  let n = 2;
  while (await client.get('SELECT 1 FROM activities WHERE slug = ?', [slug])) {
    slug = `${base}-${n++}`;
  }
  return slug;
}
