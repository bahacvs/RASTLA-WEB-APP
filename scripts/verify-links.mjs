/**
 * Paylaşılabilir rezervasyon linkinin testi.
 *
 * Bu özelliğin varlık sebebi ürünün asıl vaadi: **bütün kanallarınız tek
 * takvimde.** İşletmenin kendi kanalından (Instagram, tabela, WhatsApp) gelen
 * müşteri sisteme girmediği sürece o vaat boş kalıyordu — elle kayıt açmak
 * gerekiyordu ve kimse her telefon için panel açmıyor.
 *
 * Sınananlar:
 *   1. `/r/<KOD>` doğru ilana yönlendiriyor ve kodu adrese taşıyor.
 *   2. Bu linkten gelen rezervasyon **linkin kanalıyla** kaydediliyor ve
 *      linkin sayacı artıyor.
 *   3. **Kaynak FORMDAN belirlenemiyor.** Forma elle `source` yazmak kaydın
 *      kanalını değiştirmiyor; kanal yalnızca veritabanındaki link satırından
 *      geliyor. Bugün bu yalnızca istatistiği korur, kanal bazlı komisyon
 *      geldiğinde parayı.
 *   4. **Başka bir ilanın kodu yok sayılıyor.** Geçerli ama ilgisiz bir kodla
 *      gelen rezervasyon o kanala yazılmıyor.
 *   5. Kapatılmış link çalışmıyor; müşteri ana sayfaya düşüyor ve kayıt
 *      SİLİNMİYOR (geçmiş kanal bilgisi korunuyor).
 *   6. Bilinmeyen kod hata sayfası değil ana sayfa veriyor.
 *   7. QR ucu yalnızca gerçek kod için PNG üretiyor; serbest metin kabul
 *      etmiyor (kendi alan adımızdan keyfi QR üretilememeli).
 *   8. Kod tahmin edilemez: 8 karakter, sayaç ya da slug değil.
 *
 * Kullanım:
 *   npm start > server.log &
 *   node scripts/verify-links.mjs
 */
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { db as connect } from '../lib/db/index.mjs';
import { ensureTestAccounts } from './lib/test-accounts.mjs';
import { book, testPhone } from './lib/booking.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const OPERATOR = 'buyukcekmece-wsc';

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const store = await connect();
await ensureTestAccounts();

const now = new Date().toISOString();
const tag = Date.now();

// ---------------------------------------------------------------- kurulum

async function seedActivity(suffix) {
  const id = randomUUID();
  const slug = `link-test-${suffix}-${tag}`;

  await store.run(
    `INSERT INTO activities (id, operator_id, slug, title, category, price_try, duration_minutes,
       location_name, capacity_mode, status, created_at)
     VALUES (?, ?, ?, ?, 'jet-ski', 300, 30, 'Sahil', 'per_person', 'published', ?)`,
    [id, OPERATOR, slug, `Link Testi ${suffix} ${tag}`, now]
  );

  const day = new Date();
  day.setDate(day.getDate() + 3);
  const date = day.toISOString().slice(0, 10);

  await store.run(
    `INSERT INTO slots (id, activity_id, slot_date, slot_time, capacity, booked, status, created_at)
     VALUES (?, ?, ?, '13:00', 10, 0, 'open', ?)`,
    [randomUUID(), id, date, now]
  );

  return { id, slug, date };
}

const actA = await seedActivity('a');
const actB = await seedActivity('b');

const { createLink, generateLinkCode } = await import('../lib/db/booking-links.ts');

const linkA = await createLink({
  activityId: actA.id,
  operatorId: OPERATOR,
  label: `Instagram ${tag}`,
  source: 'instagram',
});
const linkB = await createLink({
  activityId: actB.id,
  operatorId: OPERATOR,
  label: `Tabela ${tag}`,
  source: 'link',
});

// ---------- Kod tahmin edilebilir mi? ----------

const codes = new Set(Array.from({ length: 200 }, () => generateLinkCode()));
check(
  'link kodu 8 karakter ve karışan harfler yok (I/L/O/U)',
  linkA.code.length === 8 && !/[ILOU]/.test(linkA.code),
  linkA.code
);
check(
  '200 kodun hepsi FARKLI — sayaç ya da slug değil, rastgele',
  codes.size === 200,
  `${codes.size}/200 benzersiz`
);

// ---------------------------------------------------------------- tarayıcı

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

async function freshPage() {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

// ---------- 1. Kısa link doğru ilana götürüyor ----------

{
  const { context, page } = await freshPage();
  await page.goto(`${BASE}/r/${linkA.code}`, { waitUntil: 'networkidle' });

  check(
    'kısa link doğru ilanın rezervasyon sayfasına götürüyor',
    page.url().includes(`/rezervasyon/${actA.slug}`),
    page.url()
  );
  check('kod adrese taşınıyor', page.url().includes(`k=${linkA.code}`), page.url());
  await context.close();
}

// ---------- 6. Bilinmeyen kod ana sayfaya düşüyor ----------

{
  const { context, page } = await freshPage();
  await page.goto(`${BASE}/r/ZZZZZZZZ`, { waitUntil: 'networkidle' });
  check(
    'bilinmeyen kod hata sayfası değil ANA SAYFA veriyor',
    new URL(page.url()).pathname === '/',
    page.url()
  );
  await context.close();
}

// ---------- 2. Linkten gelen rezervasyon kanalı taşıyor ----------

{
  const { context, page } = await freshPage();
  const result = await book(page, {
    baseUrl: BASE,
    slug: actA.slug,
    name: `Link Misafiri ${tag}`,
    phone: testPhone('5591').display,
    query: `k=${linkA.code}`,
  });

  check('linkten rezervasyon açılabiliyor', Boolean(result.code), result.error ?? '');

  if (result.code) {
    const row = await store.get('SELECT source FROM bookings WHERE code = ?', [result.code]);
    check(
      'rezervasyon LİNKİN kanalıyla kaydediliyor',
      row?.source === 'instagram',
      `kaynak: ${row?.source}`
    );

    const link = await store.get('SELECT bookings FROM booking_links WHERE id = ?', [linkA.id]);
    check(
      'linkin rezervasyon sayacı artıyor',
      Number(link.bookings) === 1,
      `sayaç: ${link.bookings}`
    );
  }
  await context.close();
}

// ---------- 3. Kaynak FORMDAN belirlenemiyor ----------
//
// Asıl güvence bu. Forma `source` alanı elle eklenip gönderiliyor; sunucu
// onu görmezden gelmeli ve kanalı yalnızca link satırından okumalı.

{
  const { context, page } = await freshPage();
  const result = await book(page, {
    baseUrl: BASE,
    slug: actA.slug,
    name: `Sahte Kanal ${tag}`,
    phone: testPhone('5592').display,
    query: `k=${linkA.code}`,
    beforeSubmit: async (p) => {
      await p.evaluate(() => {
        const form = document.querySelector('form');
        if (!form) return;
        const inject = (name, value) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          form.appendChild(input);
        };
        inject('source', 'hotel');
        inject('kaynak', 'hotel');
      });
    },
  });

  if (result.code) {
    const row = await store.get('SELECT source FROM bookings WHERE code = ?', [result.code]);
    check(
      'forma elle yazılan kaynak YOK SAYILIYOR — kanal link satırından geliyor',
      row?.source === 'instagram',
      `kaynak: ${row?.source} (forma 'hotel' enjekte edildi)`
    );
  } else {
    check('forma elle yazılan kaynak YOK SAYILIYOR', false, result.error ?? 'rezervasyon açılmadı');
  }
  await context.close();
}

// ---------- 4. Başka ilanın kodu yok sayılıyor ----------

{
  const { context, page } = await freshPage();
  const result = await book(page, {
    baseUrl: BASE,
    slug: actA.slug,
    name: `Yanlis Kod ${tag}`,
    phone: testPhone('5593').display,
    // B ilanının kodu, A ilanının sayfasında.
    query: `k=${linkB.code}`,
  });

  if (result.code) {
    const row = await store.get('SELECT source FROM bookings WHERE code = ?', [result.code]);
    check(
      'BAŞKA ilanın kodu yok sayılıyor — kaynak rastla kalıyor',
      row?.source === 'rastla',
      `kaynak: ${row?.source}`
    );

    const other = await store.get('SELECT bookings FROM booking_links WHERE id = ?', [linkB.id]);
    check(
      'ilgisiz linkin sayacı ARTMIYOR',
      Number(other.bookings) === 0,
      `sayaç: ${other.bookings}`
    );
  } else {
    check('BAŞKA ilanın kodu yok sayılıyor', false, result.error ?? 'rezervasyon açılmadı');
  }
  await context.close();
}

// ---------- 7. QR ucu ----------

{
  const { context, page } = await freshPage();
  // `fetch` sayfanın kaynağından çalışıyor; boş sekmede kaynak yok.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

  const ok = await page.evaluate(async (url) => {
    const r = await fetch(url);
    const buf = new Uint8Array(await r.arrayBuffer());
    // PNG imzası: 89 50 4E 47
    return {
      status: r.status,
      png: buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
      type: r.headers.get('content-type'),
    };
  }, `${BASE}/api/qr/${linkA.code}`);

  check(
    'QR ucu gerçek kod için PNG üretiyor',
    ok.status === 200 && ok.png && ok.type === 'image/png',
    `${ok.status} · ${ok.type} · png imzası: ${ok.png}`
  );

  const bad = await page.evaluate(async (url) => (await fetch(url)).status, `${BASE}/api/qr/ZZZZZZZZ`);
  check('QR ucu uydurma kod için 404 veriyor — serbest metin QR servisi değil', bad === 404, String(bad));

  await context.close();
}

// ---------- 5. Kapatılmış link ----------

{
  await store.run('UPDATE booking_links SET disabled_at = ? WHERE id = ?', [now, linkA.id]);

  const { context, page } = await freshPage();
  await page.goto(`${BASE}/r/${linkA.code}`, { waitUntil: 'networkidle' });
  check(
    'KAPATILMIŞ link ana sayfaya düşüyor',
    new URL(page.url()).pathname === '/',
    page.url()
  );
  await context.close();

  const row = await store.get('SELECT bookings, label FROM booking_links WHERE id = ?', [linkA.id]);
  check(
    'kapatılan link SİLİNMİYOR — geçmiş kanal bilgisi duruyor',
    row !== undefined && Number(row.bookings) >= 1,
    `sayaç: ${row?.bookings}`
  );
}

await browser.close();

// Temizlik
await store.run('DELETE FROM bookings WHERE activity_slug IN (?, ?)', [actA.slug, actB.slug]);
await store.run('DELETE FROM booking_links WHERE activity_id IN (?, ?)', [actA.id, actB.id]);
await store.run('DELETE FROM slots WHERE activity_id IN (?, ?)', [actA.id, actB.id]);
await store.run('DELETE FROM activities WHERE id IN (?, ?)', [actA.id, actB.id]);
await store.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
