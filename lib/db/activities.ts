import { randomUUID } from 'node:crypto';
import { db } from './index';
import type { Activity, ActivityCategory, CapacityMode, Review } from '../catalog';

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
  capacity_mode: CapacityMode;
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
  status: 'draft' | 'published';
  remaining_today?: number;
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
    capacityMode: row.capacity_mode,
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
    remainingToday: row.remaining_today,
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
export function listPublishedActivities(): Activity[] {
  const rows = db()
    .prepare(
      `SELECT a.*,
              (SELECT COALESCE(SUM(s.capacity - s.booked), 0)
                 FROM slots s
                WHERE s.activity_id = a.id AND s.slot_date = ? AND s.status = 'open'
              ) AS remaining_today
         FROM activities a
        WHERE a.status = 'published'
        ORDER BY a.created_at`
    )
    .all(todayIso()) as Row[];
  return rows.map(toActivity);
}

export function listActivitiesForOperator(operatorId: string): Activity[] {
  const rows = db()
    .prepare(`${SELECT} WHERE operator_id = ? ORDER BY created_at DESC`)
    .all(operatorId) as Row[];
  return rows.map(toActivity);
}

export function getActivityBySlug(slug: string): Activity | null {
  const row = db().prepare(`${SELECT} WHERE slug = ?`).get(slug) as Row | undefined;
  return row ? toActivity(row) : null;
}

export function getActivityById(id: string): Activity | null {
  const row = db().prepare(`${SELECT} WHERE id = ?`).get(id) as Row | undefined;
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
  capacityMode: CapacityMode;
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
  status?: 'draft' | 'published';
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
    capacity_mode: input.capacityMode,
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

export function createActivity(input: ActivityInput): Activity {
  const id = randomUUID();

  db()
    .prepare(
      `INSERT INTO activities
         (id, operator_id, slug, title, category, description, price_try, duration_minutes,
          location_name, lat, lng, capacity_mode, image, image_alt, included, safety,
          gallery, meeting_point, reviews, capacity_label, instant_confirm, rating, review_count,
          status, created_at)
       VALUES
         (@id, @operator_id, @slug, @title, @category, @description, @price_try, @duration_minutes,
          @location_name, @lat, @lng, @capacity_mode, @image, @image_alt, @included, @safety,
          @gallery, @meeting_point, @reviews, @capacity_label, @instant_confirm, @rating, @review_count,
          @status, @created_at)`
    )
    .run({ id, ...toParams(input), created_at: new Date().toISOString() });

  return getActivityById(id)!;
}

export function updateActivity(id: string, input: ActivityInput): Activity | null {
  db()
    .prepare(
      `UPDATE activities SET
         slug = @slug, title = @title, category = @category, description = @description,
         price_try = @price_try, duration_minutes = @duration_minutes,
         location_name = @location_name, lat = @lat, lng = @lng,
         capacity_mode = @capacity_mode, image = @image, image_alt = @image_alt,
         included = @included, safety = @safety, gallery = @gallery,
         meeting_point = @meeting_point, reviews = @reviews, capacity_label = @capacity_label,
         instant_confirm = @instant_confirm, rating = @rating, review_count = @review_count,
         status = @status
       WHERE id = @id`
    )
    .run({ id, ...toParams(input) });

  return getActivityById(id);
}

export function setActivityStatus(id: string, status: 'draft' | 'published') {
  db().prepare('UPDATE activities SET status = ? WHERE id = ?').run(status, id);
}

/** Başlıktan URL'e uygun bir slug türetir; çakışırsa sonuna sayı ekler. */
export function uniqueSlug(title: string): string {
  const base =
    title
      .toLocaleLowerCase('tr-TR')
      .replaceAll('ı', 'i')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'aktivite';

  let slug = base;
  let n = 2;
  while (db().prepare('SELECT 1 FROM activities WHERE slug = ?').get(slug)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}
