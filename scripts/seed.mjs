/**
 * Başlangıç verisini veritabanına yazar.
 *
 * Aktiviteler önceden `lib/data.ts` içinde sabitti; işletme yönetimine
 * geçerken buraya taşındılar. Betik idempotenttir: var olan slug'ı atlar,
 * böylece tekrar çalıştırmak güvenlidir.
 *
 * Her aktiviteye örnek bir takvim kuralı da eklenir ve slotlar üretilir.
 *
 * Kullanım: npm run seed
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'rastla.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.exec(readFileSync(join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8'));

const BUYUKCEKMECE = 'buyukcekmece-wsc';
const MIMARSINAN = 'mimarsinan-marina';

/**
 * Koordinatlar Büyükçekmece ve Mimarsinan çevresinden yaklaşık değerlerdir.
 * Gerçek buluşma noktaları işletmeler tarafından harita üzerinden düzeltilmeli.
 */
const ACTIVITIES = [
  {
    slug: 'elektrikli-sup-deneyimi',
    operatorId: BUYUKCEKMECE,
    title: 'RASTLA Elektrikli SUP Deneyimi',
    category: 'elektrikli-sup',
    priceTRY: 600,
    durationMinutes: 60,
    location: 'Büyükçekmece Sahili',
    lat: 41.0182,
    lng: 28.5795,
    capacityMode: 'per_person',
    capacityLabel: '1-5 Kişi',
    instantConfirm: true,
    rating: 4.9,
    reviewCount: 128,
    image: '/images/sup-coastline.jpg',
    imageAlt: 'Güneşli bir kıyı yakınında sakin mavi sularda kürek süren bir kişi',
    description:
      'Sakin suların tadını yeni nesil teknolojiyle çıkarın. Yorulmadan süzülün. RASTLA Elektrikli SUP Deneyimi, hem yeni başlayanlar hem de tecrübeliler için mükemmel bir su sporu macerası sunar. Sessiz motoru sayesinde doğanın keyfini çıkarırken efor sarf etmeden uzun mesafeler kat edebilirsiniz.',
    included: ['Can yeleği', 'Temel eğitim', 'Su geçirmez çanta'],
    safety: ['Profesyonel eğitmen eşliği', 'Kask temini', 'GPS takip sistemi'],
    gallery: [
      { src: '/images/esup-action.jpg', alt: 'Berrak sular üzerinde elektrikli SUP kullanan bir kişi' },
      { src: '/images/esup-motor-detail.jpg', alt: 'Modern bir elektrikli SUP’un motor detayının yakın çekimi' },
      { src: '/images/esup-group-sunset.jpg', alt: 'Gün batımında elektrikli SUP ile eğlenen bir arkadaş grubu' },
    ],
    meetingPoint: {
      image: '/images/map-meeting-point.jpg',
      alt: 'Büyükçekmece kıyı bölgesini gösteren sade, açık temalı harita kesiti',
    },
    reviews: [
      {
        author: 'Ayşe Y.',
        initial: 'A',
        timeAgo: '2 hafta önce',
        rating: 5,
        comment:
          'Harika bir deneyimdi! Eğitmenler çok ilgiliydi ve ekipmanlar yepyeniydi. Kesinlikle tavsiye ederim.',
      },
    ],
    schedule: { start: '09:00', end: '19:00', interval: 60, capacity: 5 },
  },
  {
    slug: 'premium-jet-ski',
    operatorId: BUYUKCEKMECE,
    title: 'Premium Jet Ski Kiralama',
    category: 'jet-ski',
    priceTRY: 1200,
    durationMinutes: 30,
    location: 'Büyükçekmece Sahil',
    lat: 41.0155,
    lng: 28.5862,
    // Her müşteriye bir araç düşer: kapasite rezervasyon başına sayılır.
    capacityMode: 'per_booking',
    capacityLabel: '1-2 Kişi',
    instantConfirm: true,
    rating: 4.9,
    reviewCount: 124,
    image: '/images/jetski-hero.jpg',
    imageAlt: 'Parlak mavi deniz üzerinde hızla ilerleyen bir jet ski',
    schedule: { start: '08:00', end: '18:00', interval: 15, capacity: 4 },
  },
  {
    slug: 'gun-batimi-sup-turu',
    operatorId: MIMARSINAN,
    title: 'Gün Batımı SUP Turu',
    category: 'sup',
    priceTRY: 450,
    durationMinutes: 60,
    location: 'Mimaroba Koyu',
    lat: 40.9861,
    lng: 28.6244,
    capacityMode: 'per_person',
    capacityLabel: '1-8 Kişi',
    instantConfirm: false,
    rating: 4.7,
    reviewCount: 89,
    image: '/images/sup-sunset.jpg',
    imageAlt: 'Gün batımında sakin sularda kürek süren bir kişi',
    schedule: { start: '17:00', end: '20:00', interval: 90, capacity: 8 },
  },
  {
    slug: 'ruzgar-sorfu-baslangic',
    operatorId: MIMARSINAN,
    title: 'Başlangıç Seviyesi Rüzgar Sörfü',
    category: 'ruzgar-sorfu',
    priceTRY: 1200,
    durationMinutes: 120,
    location: 'Mimarsinan Marina',
    lat: 41.0031,
    lng: 28.6118,
    capacityMode: 'per_person',
    capacityLabel: '1-4 Kişi',
    instantConfirm: false,
    rating: 4.7,
    reviewCount: 85,
    image: '/images/windsurf-action.jpg',
    imageAlt: 'Öğleden sonra dalgalar üzerinde ilerleyen bir rüzgâr sörfçüsü',
    schedule: { start: '10:00', end: '16:00', interval: 180, capacity: 4 },
  },
  {
    slug: 'tekli-kano-kiralama',
    operatorId: BUYUKCEKMECE,
    title: 'Tekli Kano Kiralama',
    category: 'kano',
    priceTRY: 250,
    durationMinutes: 60,
    location: 'Büyükçekmece Sahili',
    lat: 41.0201,
    lng: 28.5771,
    capacityMode: 'per_booking',
    capacityLabel: '1 Kişi',
    instantConfirm: true,
    rating: 4.6,
    reviewCount: 52,
    image: '/images/kayaks-beach.jpg',
    imageAlt: 'Kumsalda duran renkli kanolar ve arkada berrak deniz',
    schedule: { start: '09:00', end: '18:00', interval: 60, capacity: 6 },
  },
  {
    slug: 'ozel-tekne-turu',
    operatorId: MIMARSINAN,
    title: 'Özel Tekne Turu (2 Saat)',
    category: 'tekne',
    priceTRY: 3500,
    durationMinutes: 120,
    location: 'Mimarsinan Marina',
    lat: 41.0044,
    lng: 28.6155,
    capacityMode: 'per_person',
    capacityLabel: '1-10 Kişi',
    instantConfirm: true,
    rating: 4.8,
    reviewCount: 41,
    image: '/images/boat-aerial.jpg',
    imageAlt: 'Kıyı boyunca ilerleyen küçük beyaz teknenin havadan görüntüsü',
    schedule: { start: '11:00', end: '17:00', interval: 120, capacity: 10 },
  },
];

const now = new Date().toISOString();
const today = new Date();
const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const insertActivity = db.prepare(`
  INSERT INTO activities
    (id, operator_id, slug, title, category, description, price_try, duration_minutes,
     location_name, lat, lng, capacity_mode, image, image_alt, included, safety,
     gallery, meeting_point, reviews, capacity_label, instant_confirm, rating, review_count,
     status, created_at)
  VALUES
    (@id, @operator_id, @slug, @title, @category, @description, @price_try, @duration_minutes,
     @location_name, @lat, @lng, @capacity_mode, @image, @image_alt, @included, @safety,
     @gallery, @meeting_point, @reviews, @capacity_label, @instant_confirm, @rating, @review_count,
     'published', @created_at)
`);

const insertRule = db.prepare(`
  INSERT INTO schedule_rules
    (id, activity_id, weekdays, start_time, end_time, interval_minutes, capacity,
     valid_from, valid_until, active, created_at)
  VALUES (?, ?, 127, ?, ?, ?, ?, ?, NULL, 1, ?)
`);

const insertSlot = db.prepare(`
  INSERT INTO slots (id, activity_id, rule_id, slot_date, slot_time, capacity, booked, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, 0, 'open', ?)
  ON CONFLICT (activity_id, slot_date, slot_time) DO NOTHING
`);

function times(start, end, step) {
  const m = (t) => {
    const [h, mm] = t.split(':').map(Number);
    return h * 60 + mm;
  };
  const out = [];
  for (let x = m(start); x < m(end); x += step) {
    out.push(`${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`);
  }
  return out;
}

const HORIZON_DAYS = 60;
let created = 0;
let slotsCreated = 0;

const run = db.transaction(() => {
  for (const a of ACTIVITIES) {
    if (db.prepare('SELECT 1 FROM activities WHERE slug = ?').get(a.slug)) continue;

    const id = randomUUID();
    insertActivity.run({
      id,
      operator_id: a.operatorId,
      slug: a.slug,
      title: a.title,
      category: a.category,
      description: a.description ?? null,
      price_try: a.priceTRY,
      duration_minutes: a.durationMinutes,
      location_name: a.location,
      lat: a.lat,
      lng: a.lng,
      capacity_mode: a.capacityMode,
      image: a.image,
      image_alt: a.imageAlt,
      included: a.included ? JSON.stringify(a.included) : null,
      safety: a.safety ? JSON.stringify(a.safety) : null,
      gallery: a.gallery ? JSON.stringify(a.gallery) : null,
      meeting_point: a.meetingPoint ? JSON.stringify(a.meetingPoint) : null,
      reviews: a.reviews ? JSON.stringify(a.reviews) : null,
      capacity_label: a.capacityLabel ?? null,
      instant_confirm: a.instantConfirm ? 1 : 0,
      rating: a.rating,
      review_count: a.reviewCount,
      created_at: now,
    });
    created++;

    const ruleId = randomUUID();
    const s = a.schedule;
    insertRule.run(ruleId, id, s.start, s.end, s.interval, s.capacity, isoToday, now);

    const slotTimes = times(s.start, s.end, s.interval);
    for (let d = 0; d < HORIZON_DAYS; d++) {
      const day = new Date(today);
      day.setDate(day.getDate() + d);
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      for (const t of slotTimes) {
        slotsCreated += insertSlot.run(randomUUID(), id, ruleId, date, t, s.capacity, now).changes;
      }
    }
  }
});
run();

console.log(`${created} aktivite eklendi (${ACTIVITIES.length - created} zaten vardı)`);
console.log(`${slotsCreated} slot üretildi (${HORIZON_DAYS} günlük ufuk)`);
