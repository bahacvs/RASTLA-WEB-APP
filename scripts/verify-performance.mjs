/**
 * Ekranların **sorgu sayısı rezervasyon sayısıyla büyümüyor** testi.
 *
 * Bu süitin varlık sebebi ölçülmüş bir arıza: işletme ekranları müşteri
 * adlarını ve slotları döngü içinde tek tek çekiyordu. Dolu bir günde Bugün
 * ekranı 82 ayrı sorgu atıyor ve sunucu ile Frankfurt'taki veritabanı
 * arasındaki ~176 ms yüzünden sekiz saniyeye çıkıyordu.
 *
 * Hata YEREL GELİŞTİRMEDE GÖRÜNMÜYORDU: SQLite sorgusu 0,1 ms sürüyor,
 * seksen iki tanesi bile fark edilmiyor. Bu yüzden test süreyi değil
 * **sorgu sayısını** ölçüyor — ağ gecikmesinden bağımsız, yerelde de
 * anlamlı ve regresyonu gerçekten yakalayan ölçü bu.
 *
 * Sınananlar:
 *   1. Bugün ekranı AZ rezervasyonla kaç sorgu atıyor.
 *   2. ÇOK rezervasyonla kaç sorgu atıyor — sayı neredeyse aynı kalmalı.
 *   3. Rezervasyonlar ekranı için aynı ölçüm.
 *   4. Rezervasyon (müşteri) ekranı sabit sayıda sorgu atıyor.
 *
 * Ölçüt "sabit" değil "büyümüyor": bir ekranın kaç sorgu attığı zamanla
 * değişebilir, ama rezervasyon sayısıyla ORANTILI büyümesi her zaman hatadır.
 *
 * Kullanım:
 *   RASTLA_QUERY_LOG=1 npm start > server.log &
 *   SERVER_LOG=server.log node scripts/verify-performance.mjs
 */
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { db as connect } from '../lib/db/index.mjs';
import { ensureTestAccounts, loginAs } from './lib/test-accounts.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const LOG = process.env.SERVER_LOG;
const OPERATOR = 'buyukcekmece-wsc';

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

if (!LOG || !existsSync(LOG)) {
  console.error('SERVER_LOG tanımlı değil ya da dosya yok.');
  console.error('Sunucu RASTLA_QUERY_LOG=1 ile başlatılmalı:');
  console.error('  RASTLA_QUERY_LOG=1 npm start > server.log &');
  process.exit(1);
}

const store = await connect();
await ensureTestAccounts();

const now = new Date().toISOString();
const tag = Date.now();
const today = new Date().toISOString().slice(0, 10);

/** Günlükteki `[sql]` satır sayısı — sorgu sayacı. */
function queryCount() {
  return readFileSync(LOG, 'utf8').split('\n').filter((l) => l.startsWith('[sql]')).length;
}

// ---------------------------------------------------------------- kurulum

const activityId = randomUUID();
const slug = `perf-test-${tag}`;

await store.run(
  `INSERT INTO activities (id, operator_id, slug, title, category, price_try, duration_minutes,
     location_name, capacity_mode, status, created_at)
   VALUES (?, ?, ?, ?, 'jet-ski', 500, 30, 'Sahil', 'per_person', 'published', ?)`,
  [activityId, OPERATOR, slug, `Performans Testi ${tag}`, now]
);

const slotId = randomUUID();
await store.run(
  `INSERT INTO slots (id, activity_id, slot_date, slot_time, capacity, booked, status, created_at)
   VALUES (?, ?, ?, '08:15', 400, 0, 'open', ?)`,
  [slotId, activityId, today, now]
);

/**
 * N rezervasyon ekler — her biri AYRI müşteriyle.
 *
 * Ayrı müşteri şart: hatanın kaynağı müşteri başına bir sorgu atmaktı ve
 * hepsi aynı kişi olsaydı tekilleştirme sayıyı düşürür, test hatayı
 * göremezdi.
 */
async function addBookings(count, offset) {
  for (let i = 0; i < count; i++) {
    const userId = randomUUID();
    const phone = `9059${String(tag).slice(-6)}${String(offset + i).padStart(3, '0')}`;

    await store.run('INSERT INTO users (id, name, phone, created_at) VALUES (?, ?, ?, ?)', [
      userId,
      `Performans Misafiri ${offset + i}`,
      phone,
      now,
    ]);

    await store.run(
      `INSERT INTO bookings
         (id, code, user_id, activity_slug, operator_id, slot_id, units, equipment_units,
          source, payment_mode, booking_date, booking_time, adults, children, total_try,
          status, created_at, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, 'rastla', 'onsite', ?, '08:15', 1, 0, 500,
               'confirmed', ?, ?)`,
      [randomUUID(), `PERF-${tag}-${offset + i}`, userId, slug, OPERATOR, slotId, today, now, now]
    );
  }

  await store.run('UPDATE slots SET booked = booked + ? WHERE id = ?', [count, slotId]);
}

// ------------------------------------------------------------------ ölçüm

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const context = await browser.newContext();
const page = await context.newPage();
await loginAs(page, BASE, OPERATOR, 'owner');

/** Sayfayı yükler ve o yükleme sırasında atılan sorgu sayısını döner. */
async function measure(path) {
  // Önce bir kez ısıtılıyor: ilk istekte şema kurulumu ve oturum okumaları
  // sayıma karışıyor ve ölçülen şey ekran değil, açılış oluyor.
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const before = queryCount();
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  return queryCount() - before;
}

await addBookings(5, 0);
const fewToday = await measure('/isletme/bugun');
const fewList = await measure(`/isletme/rezervasyonlar?gun=${today}`);

await addBookings(75, 100);
const manyToday = await measure('/isletme/bugun');
const manyList = await measure(`/isletme/rezervasyonlar?gun=${today}`);

// Eşik: on beş kat rezervasyon, sorgu sayısında en fazla birkaç fark.
// Doğrusal olsaydı 5 → 80 arasında yetmiş beş sorgu eklenirdi.
const TOLERANCE = 8;

check(
  'Bugün ekranı: 5 rezervasyonda sorgu sayısı ölçüldü',
  fewToday > 0,
  `${fewToday} sorgu`
);
check(
  'Bugün ekranı 80 rezervasyonda da AYNI sayıda sorgu atıyor (N+1 yok)',
  manyToday - fewToday <= TOLERANCE,
  `5 rez: ${fewToday} sorgu · 80 rez: ${manyToday} sorgu · fark ${manyToday - fewToday}`
);

check(
  'Rezervasyonlar ekranı 80 rezervasyonda da AYNI sayıda sorgu atıyor',
  manyList - fewList <= TOLERANCE,
  `5 rez: ${fewList} sorgu · 80 rez: ${manyList} sorgu · fark ${manyList - fewList}`
);

// Müşteri tarafı: rezervasyon ekranı slot sayısından bağımsız olmalı.
const bookingScreen = await measure(`/rezervasyon/${slug}`);
check(
  'Rezervasyon ekranı sabit sayıda sorgu atıyor',
  bookingScreen > 0 && bookingScreen <= 12,
  `${bookingScreen} sorgu`
);

// Karşı kontrol: sayaç gerçekten sayıyor mu. Hep sıfır dönseydi bütün
// kontroller "fark yok" diye GEÇERDİ — doğru sonucu yanlış sebeple.
check(
  'sorgu sayacı çalışıyor — sayfalar gerçekten veritabanına gidiyor',
  fewToday >= 3 && manyToday >= 3,
  `en az: ${Math.min(fewToday, manyToday)} sorgu`
);

await context.close();
await browser.close();

// Temizlik
await store.run('DELETE FROM bookings WHERE activity_slug = ?', [slug]);
await store.run('DELETE FROM slots WHERE activity_id = ?', [activityId]);
await store.run('DELETE FROM activities WHERE id = ?', [activityId]);
await store.run(`DELETE FROM users WHERE phone LIKE '9059${String(tag).slice(-6)}%'`);
await store.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
