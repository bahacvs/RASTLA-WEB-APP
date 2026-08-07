/**
 * Tanıtım verisi — siteyi gezip incelemek için.
 *
 * `scripts/seed.mjs`'ten farkı: bu betik **uydurma işletmeler** ve onlara ait
 * ilanlar üretir, üstelik **parolası bilinen** hesaplar açar ki her ekrana
 * girilebilsin. Seed betiği üretim içindir ve parolayı yalnızca bir kez yazar.
 *
 * İşletme adları bilinçli olarak var olmayan işletmelerdir. Gerçek bir
 * Büyükçekmece işletmesinin adını uydurma fiyat ve takvimle yayımlamak, o
 * işletme adına taahhütte bulunmak olurdu.
 *
 * DEMO_MODE=1 ile birlikte kullanılmalıdır: o bayrak siteyi arama motorlarına
 * kapatır ve her sayfaya "bu bir tanıtım sürümü" şeridi koyar.
 *
 * Kullanım:
 *   node scripts/demo-seed.mjs                 # veri + hesaplar
 *   node scripts/demo-seed.mjs --parola "..."  # kendi parolanı belirle
 */
import { randomUUID, randomBytes } from 'node:crypto';
import { db as connect } from '../lib/db/index.mjs';
import { hashPassword } from '../lib/password.mjs';

const args = process.argv.slice(2);
const passwordArg = args.indexOf('--parola');

/**
 * Ortak parola.
 *
 * Verilmezse rastgele üretilir ve **yalnızca bu çalıştırmada** ekrana yazılır.
 * Kodun içine sabit bir parola gömmek, herkese açık bir depoda o parolayı
 * yayımlamak demek olurdu.
 */
const PASSWORD =
  passwordArg >= 0 && args[passwordArg + 1]
    ? args[passwordArg + 1]
    : `demo-${randomBytes(6).toString('base64url')}`;

const db = await connect();
const now = new Date().toISOString();

// --------------------------------------------------------------- işletmeler

const OPERATORS = [
  {
    id: 'demo-marti-koyu',
    name: 'Martı Koyu Su Sporları (demo)',
    owner: 'sahip@marti.demo',
    staff: 'personel@marti.demo',
  },
  {
    id: 'demo-lodos-akademi',
    name: 'Lodos Sörf Akademisi (demo)',
    owner: 'sahip@lodos.demo',
    staff: 'personel@lodos.demo',
  },
  {
    id: 'demo-kaptan-tekne',
    name: 'Kaptan Nazmi Tekne Turları (demo)',
    owner: 'sahip@kaptan.demo',
    staff: 'personel@kaptan.demo',
  },
];

// ---------------------------------------------------------------- ilanlar
//
// Görseller repodaki mevcut varlıklardan seçiliyor; demo verisi yeni dosya
// getirmiyor. Fiyat ve süreler kategori için makul aralıklarda.

const ACTIVITIES = [
  {
    operatorId: 'demo-marti-koyu',
    slug: 'demo-sabah-sup-turu',
    title: 'Sabah SUP Turu',
    category: 'sup',
    description:
      'Gün doğumundan hemen sonra, koyun sakin olduğu saatlerde yapılan rehberli kürek turu. Başlangıç seviyesi için uygundur; denge dersi ilk 15 dakikada verilir.',
    priceTRY: 550,
    durationMinutes: 90,
    location: 'Martı Koyu İskelesi',
    lat: 40.9803,
    lng: 28.5951,
    capacityMode: 'per_person',
    capacityLabel: '1-8 Kişi',
    image: '/images/sup-coastline.jpg',
    imageAlt: 'Sabah ışığında sakin suda kürek çeken bir kişi',
    included: ['SUP board ve kürek', 'Can yeleği', 'Rehber', 'Su'],
    safety: ['Yüzme bilmek gerekir', '12 yaş altı ebeveyn ile', 'Can yeleği zorunludur'],
    rating: 4.8,
    reviewCount: 63,
    schedule: { start: '07:00', end: '11:00', interval: 90, capacity: 8 },
  },
  {
    operatorId: 'demo-marti-koyu',
    slug: 'demo-jet-ski-15-dk',
    title: 'Jet Ski — 15 Dakika',
    category: 'jet-ski',
    description:
      'Belirlenmiş güvenli parkurda, eğitmen gözetiminde jet ski deneyimi. Ehliyet gerekmez, kısa brifing sonrası başlanır.',
    priceTRY: 900,
    durationMinutes: 15,
    location: 'Martı Koyu İskelesi',
    lat: 40.9803,
    lng: 28.5951,
    capacityMode: 'per_booking',
    capacityLabel: 'Araç başına 1-2 kişi',
    image: '/images/jetski-hero.jpg',
    imageAlt: 'Mavi deniz üzerinde hızla ilerleyen jet ski',
    included: ['Jet ski', 'Can yeleği', 'Kısa eğitim'],
    safety: ['18 yaş sınırı', 'Alkollü katılım yasak', 'Parkur dışına çıkılamaz'],
    rating: 4.6,
    reviewCount: 128,
    schedule: { start: '09:00', end: '19:00', interval: 30, capacity: 4 },
  },
  {
    operatorId: 'demo-lodos-akademi',
    slug: 'demo-ruzgar-sorfu-dersi',
    title: 'Rüzgâr Sörfü Başlangıç Dersi',
    category: 'ruzgar-sorfu',
    description:
      'Karada denge ve yelken kontrolüyle başlayan, ardından suda birebir devam eden üç saatlik başlangıç dersi. Ekipman dahildir.',
    priceTRY: 1400,
    durationMinutes: 180,
    location: 'Lodos Sörf Merkezi',
    lat: 41.0012,
    lng: 28.6087,
    capacityMode: 'per_person',
    capacityLabel: '1-4 Kişi',
    image: '/images/windsurf-action.jpg',
    imageAlt: 'Dalgalar üzerinde ilerleyen bir rüzgâr sörfçüsü',
    included: ['Board ve yelken', 'Wetsuit', 'Eğitmen', 'Can yeleği'],
    safety: ['Yüzme bilmek zorunludur', '14 yaş sınırı', 'Rüzgâr 25 knot üzerindeyse iptal'],
    rating: 4.9,
    reviewCount: 41,
    schedule: { start: '10:00', end: '16:00', interval: 180, capacity: 4 },
  },
  {
    operatorId: 'demo-lodos-akademi',
    slug: 'demo-kano-kiralama',
    title: 'Çift Kişilik Kano Kiralama',
    category: 'kano',
    description:
      'Saatlik kano kiralama. Koy içinde serbest kullanım, kıyıdan en fazla 300 metre açılma sınırı vardır.',
    priceTRY: 400,
    durationMinutes: 60,
    location: 'Lodos Sörf Merkezi',
    lat: 41.0012,
    lng: 28.6087,
    capacityMode: 'per_booking',
    capacityLabel: 'Kano başına 2 kişi',
    image: '/images/kayaks-beach.jpg',
    imageAlt: 'Sakin suda çift kişilik kano',
    included: ['Kano ve kürekler', 'Can yeleği', 'Su geçirmez kese'],
    safety: ['Yüzme bilmek gerekir', 'Kıyıdan 300 m açılma sınırı'],
    rating: 4.5,
    reviewCount: 87,
    schedule: { start: '09:00', end: '18:00', interval: 60, capacity: 6 },
  },
  {
    operatorId: 'demo-kaptan-tekne',
    slug: 'demo-gun-batimi-tekne-turu',
    title: 'Gün Batımı Tekne Turu',
    category: 'tekne',
    description:
      'İki saatlik körfez turu. Teknede ikram servisi vardır, yüzme molası hava koşullarına bağlıdır.',
    priceTRY: 750,
    durationMinutes: 120,
    location: 'Balıkçı Barınağı, C İskelesi',
    lat: 40.9925,
    lng: 28.5834,
    capacityMode: 'per_person',
    capacityLabel: '4-20 Kişi',
    image: '/images/sup-sunset.jpg',
    imageAlt: 'Gün batımında körfez manzarası',
    included: ['2 saatlik tur', 'Çay ve ikram', 'Can yeleği'],
    safety: ['Her yaş uygundur', '6 yaş altı ücretsiz', 'Fırtınada iptal edilir'],
    rating: 4.7,
    reviewCount: 214,
    schedule: { start: '17:00', end: '21:00', interval: 120, capacity: 20 },
  },
  {
    operatorId: 'demo-kaptan-tekne',
    slug: 'demo-ozel-tekne-kiralama',
    title: 'Özel Tekne Kiralama (Yarım Gün)',
    category: 'tekne',
    description:
      'Kaptanıyla birlikte özel tekne kiralama. Rota birlikte belirlenir; azami 12 kişiliktir.',
    priceTRY: 6500,
    durationMinutes: 240,
    location: 'Balıkçı Barınağı, C İskelesi',
    lat: 40.9925,
    lng: 28.5834,
    capacityMode: 'per_booking',
    capacityLabel: 'Tekne başına 12 kişi',
    image: '/images/boat-aerial.jpg',
    imageAlt: 'İskeleye yanaşmış gezi teknesi',
    included: ['Tekne ve kaptan', 'Yakıt', 'Can yelekleri', 'Soğutucu'],
    safety: ['Kaptanın talimatlarına uyulur', 'Fırtınada iptal edilir'],
    rating: 4.9,
    reviewCount: 36,
    schedule: { start: '09:00', end: '17:00', interval: 240, capacity: 1 },
  },
];

// ------------------------------------------------------------------ yazma

const INSERT_ACTIVITY = `
  INSERT INTO activities
    (id, operator_id, slug, title, category, description, price_try, duration_minutes,
     location_name, lat, lng, capacity_mode, image, image_alt, included, safety,
     capacity_label, instant_confirm, rating, review_count, status, created_at)
  VALUES
    (@id, @operator_id, @slug, @title, @category, @description, @price_try, @duration_minutes,
     @location_name, @lat, @lng, @capacity_mode, @image, @image_alt, @included, @safety,
     @capacity_label, 1, @rating, @review_count, 'published', @created_at)`;

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

for (const op of OPERATORS) {
  await db.run(
    `INSERT INTO operators (id, name, created_at) VALUES (?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
    [op.id, op.name, now]
  );

  // Sahip ve personel: iki rol de gezilebilsin. Personel hesabı bilinçli —
  // rol ayrımının gerçekten çalıştığını görmek için sahip olmayan bir hesapla
  // da girmek gerekir.
  for (const [email, role] of [
    [op.owner, 'owner'],
    [op.staff, 'staff'],
  ]) {
    await db.run(
      `INSERT INTO operator_users
         (id, operator_id, email, name, phone, password_hash, role, status, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, 'active', ?)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = excluded.password_hash,
         status = 'active',
         role = excluded.role`,
      [
        randomUUID(),
        op.id,
        email,
        role === 'owner' ? 'Demo Sahibi' : 'Demo Personeli',
        hashPassword(PASSWORD),
        role,
        now,
      ]
    );
  }
}

const HORIZON_DAYS = 60;
const today = new Date();
const isoToday = today.toISOString().slice(0, 10);

let activityCount = 0;
let slotCount = 0;

for (const a of ACTIVITIES) {
  let row = await db.get('SELECT id FROM activities WHERE slug = ?', [a.slug]);

  if (!row) {
    const id = randomUUID();
    await db.run(INSERT_ACTIVITY, {
      id,
      operator_id: a.operatorId,
      slug: a.slug,
      title: a.title,
      category: a.category,
      description: a.description,
      price_try: a.priceTRY,
      duration_minutes: a.durationMinutes,
      location_name: a.location,
      lat: a.lat,
      lng: a.lng,
      capacity_mode: a.capacityMode,
      image: a.image,
      image_alt: a.imageAlt,
      included: JSON.stringify(a.included),
      safety: JSON.stringify(a.safety),
      capacity_label: a.capacityLabel,
      rating: a.rating,
      review_count: a.reviewCount,
      created_at: now,
    });
    row = { id };
    activityCount++;
  }

  const ruleId = randomUUID();
  await db.run(
    `INSERT INTO schedule_rules
       (id, activity_id, weekdays, start_time, end_time, interval_minutes, capacity,
        valid_from, valid_until, active, created_at)
     VALUES (?, ?, 127, ?, ?, ?, ?, ?, NULL, 1, ?)`,
    [ruleId, row.id, a.schedule.start, a.schedule.end, a.schedule.interval, a.schedule.capacity, isoToday, now]
  );

  for (let d = 0; d < HORIZON_DAYS; d++) {
    const day = new Date(today);
    day.setDate(day.getDate() + d);
    const date = day.toISOString().slice(0, 10);

    for (const time of times(a.schedule.start, a.schedule.end, a.schedule.interval)) {
      const result = await db.run(
        `INSERT INTO slots (id, activity_id, rule_id, slot_date, slot_time, capacity, booked, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'open', ?)
         ON CONFLICT (activity_id, slot_date, slot_time) DO NOTHING`,
        [randomUUID(), row.id, ruleId, date, time, a.schedule.capacity, now]
      );
      slotCount += result.changes ?? 0;
    }
  }
}

// ------------------------------------------------------------------- rapor

console.log(`\n${OPERATORS.length} demo işletmesi hazır.`);
console.log(`${activityCount} yeni ilan, ${slotCount} slot üretildi (${HORIZON_DAYS} günlük ufuk).\n`);

console.log('Giriş bilgileri — /isletme adresinden:\n');
for (const op of OPERATORS) {
  console.log(`  ${op.name}`);
  console.log(`    sahip    : ${op.owner}`);
  console.log(`    personel : ${op.staff}`);
}
console.log(`\n  ortak parola: ${PASSWORD}\n`);
console.log('Sahip rolü: aktiviteler, ödeme ayarları, ekip, işlem günlüğü.');
console.log('Personel rolü: yalnızca bilet okutma ve rezervasyon listesi.\n');
console.log('Bu hesaplar TANITIM içindir. Gerçek kullanıma geçerken hepsini');
console.log('askıya alın: /isletme/ekip ekranından ya da operator-account betiğiyle.\n');

await db.close();
