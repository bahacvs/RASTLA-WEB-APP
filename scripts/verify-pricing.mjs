/**
 * Sezon/gün/saat fiyatlandırması ve grup indiriminin testi.
 *
 * Bu özellik açılmadan önce fiyat hesabı BEŞ yerde kopyaydı ve hepsi
 * `kişi × liste fiyatı` yazıyordu. Kopyalardan biri güncellenmeseydi
 * müşteriye GÖSTERİLEN tutar ile TAHSİL EDİLEN tutar ayrışırdı — bu projedeki
 * en pahalı hata türü (hazırlık payında bir kez yaşandı). Süitin çekirdeği bu
 * ayrışmanın olmadığını kanıtlamak.
 *
 * Sınananlar:
 *   1. Kural uymadığında liste fiyatı geçerli.
 *   2. Saat kuralı doğru saatte uygulanıyor, bitiş saati HARİÇ.
 *   3. Öncelik yüksek olan kazanıyor; ekrandaki sıra hesabın sırasıyla aynı.
 *   4. Sezon dışındaki tarihe sezon fiyatı uygulanmıyor.
 *   5. Grup indirimi kişi sayısının GEÇTİĞİ en yüksek eşikten, yalnızca biri.
 *   6. **Ekranda yazan tutar ile veritabanına yazılan tutar aynı.**
 *   7. **İstemciden gelen tutara güvenilmiyor**: forma elle `total`/`totalTRY`
 *      yazmak kaydı değiştirmiyor.
 *   8. Manuel kayıt ve acente rezervasyonu da aynı tarifeyi kullanıyor —
 *      telefondan gelen müşteriye internetteki fiyat söyleniyor.
 *   9. Başka bir işletmenin ilanına kural eklenemiyor.
 *  10. Geçersiz kural (ters tarih aralığı, gün seçilmemiş, %60 indirim)
 *      reddediliyor.
 *
 * Kullanım:
 *   npm start > server.log &
 *   SERVER_LOG=server.log node scripts/verify-pricing.mjs
 */
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { db as connect } from '../lib/db/index.mjs';
import { quote } from '../lib/pricing.mjs';
import { ensureTestAccounts } from './lib/test-accounts.mjs';
import { book, testPhone } from './lib/booking.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const OPERATOR = 'buyukcekmece-wsc';
const BASE_PRICE = 1000;

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const store = await connect();
// İlanlar test işletmesine bağlanıyor; hesap yoksa yabancı anahtar tutmaz.
await ensureTestAccounts();

const now = new Date().toISOString();
const tag = Date.now();

/** Kaç gün sonrası — kesit kuralına takılmayacak kadar ileri. */
function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Tarihin haftanın kaçıncı günü olduğu — bit 0 = Pazartesi. */
function weekdayBit(date) {
  return 1 << ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7);
}

/**
 * Tek slotlu bir ilan.
 *
 * Tek slot ŞART: `book` yardımcısı listedeki ilk müsait saati seçiyor ve
 * fiyat saate bağlı. İki slot olsaydı test hangi saatin seçildiğini
 * bilemez, doğru sonucu yanlış sebeple verebilirdi.
 */
async function seedActivity(suffix, { date, time, capacity = 20 }) {
  const id = randomUUID();
  const slug = `fiyat-test-${suffix}-${tag}`;

  await store.run(
    `INSERT INTO activities (id, operator_id, slug, title, category, price_try, duration_minutes,
       location_name, capacity_mode, status, created_at)
     VALUES (?, ?, ?, ?, 'jet-ski', ?, 30, 'Sahil', 'per_person', 'published', ?)`,
    [id, OPERATOR, slug, `Fiyat Testi ${suffix} ${tag}`, BASE_PRICE, now]
  );

  const slotId = randomUUID();
  await store.run(
    `INSERT INTO slots (id, activity_id, slot_date, slot_time, capacity, booked, status, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 'open', ?)`,
    [slotId, id, date, time, capacity, now]
  );

  return { id, slug, date, time, slotId };
}

async function addRule(activityId, rule) {
  await store.run(
    `INSERT INTO price_rules (id, activity_id, label, priority, valid_from, valid_until,
       weekdays, start_time, end_time, price_try, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      activityId,
      rule.label,
      rule.priority ?? 0,
      rule.validFrom ?? null,
      rule.validUntil ?? null,
      rule.weekdays ?? 127,
      rule.startTime ?? null,
      rule.endTime ?? null,
      rule.priceTRY,
      new Date(Date.now() + (rule.ageMs ?? 0)).toISOString(),
    ]
  );
}

async function addDiscount(activityId, minPeople, percent) {
  await store.run(
    `INSERT INTO group_discounts (id, activity_id, min_people, percent, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [randomUUID(), activityId, minPeople, percent, now]
  );
}

// ------------------------------------------------------------- saf hesap
//
// Hesabın kendisi önce saf fonksiyonla sınanıyor: tarayıcı üzerinden
// dolaşmadan kuralın anlamı doğrulanmazsa, bir hata bulunduğunda arayüzde mi
// hesapta mı olduğu ayırt edilemezdi.

{
  const rules = [
    { id: 'a', label: 'Öğleden sonra', priority: 0, validFrom: null, validUntil: null,
      weekdays: 127, startTime: '12:00', endTime: '17:00', priceTRY: 1400, createdAt: '1' },
    { id: 'b', label: 'Temmuz', priority: 5, validFrom: '2026-07-01', validUntil: '2026-07-31',
      weekdays: 127, startTime: null, endTime: null, priceTRY: 1800, createdAt: '2' },
  ];

  const at = (date, time, people = 1) =>
    quote({ basePrice: BASE_PRICE, rules, discounts: [], date, time, people });

  check('kural uymuyorsa liste fiyatı', at('2026-05-12', '09:00').unitPrice === BASE_PRICE);
  check('saat kuralı uygulanıyor', at('2026-05-12', '13:00').unitPrice === 1400);
  check(
    'bitiş saati HARİÇ — 17:00 turu öğleden sonra tarifesine girmiyor',
    at('2026-05-12', '17:00').unitPrice === BASE_PRICE,
    `17:00 → ${at('2026-05-12', '17:00').unitPrice}`
  );
  check(
    'ÖNCELİĞİ yüksek kural kazanıyor (temmuz 13:00 → 1800, 1400 değil)',
    at('2026-07-15', '13:00').unitPrice === 1800,
    `${at('2026-07-15', '13:00').unitPrice}`
  );
  check(
    'sezon DIŞINDA sezon fiyatı uygulanmıyor',
    at('2026-08-01', '09:00').unitPrice === BASE_PRICE
  );

  const discounts = [
    { minPeople: 4, percent: 10 },
    { minPeople: 8, percent: 20 },
  ];
  const withGroup = (people) =>
    quote({ basePrice: BASE_PRICE, rules: [], discounts, date: '2026-05-12', time: '09:00', people });

  check('eşiğin altında indirim yok', withGroup(3).discountPercent === 0);
  check('eşiği geçen en yüksek indirim uygulanıyor (4 kişi → %10)',
    withGroup(4).discountPercent === 10);
  check('8 kişi → %20, %10 ile TOPLANMIYOR', withGroup(8).discountPercent === 20);
  check(
    '8 kişi toplamı: 8000 − 1600 = 6400',
    withGroup(8).total === 6400,
    `${withGroup(8).total}`
  );
  check(
    'indirim YUKARI yuvarlanıyor — fark müşterinin lehine',
    quote({ basePrice: 333, rules: [], discounts: [{ minPeople: 2, percent: 10 }],
      date: '2026-05-12', time: '09:00', people: 3 }).discountTRY === 100,
    'ceil(999 × %10) = 100'
  );
}

// ------------------------------------------------------------------ uçtan uca

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

async function freshPage() {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/**
 * Ekranda görünen "Toplam" tutarını sayı olarak okur.
 *
 * Metin araması DEĞİL, tutarın basıldığı öğe seçiliyor: "Toplam" kelimesi
 * bölümün başlığında da geçiyor ("Özet ve Toplam") ve metinden yakalamaya
 * çalışan ilk sürüm başlığın ardındaki tarihi (29) tutar sanmıştı.
 */
async function shownTotal(page) {
  const text = await page
    .locator('section', { hasText: 'Özet ve Toplam' })
    .last()
    .locator('.text-title-price')
    .innerText();
  // "2.800 ₺" → 2800. Binlik ayracı nokta, ondalık yok (para tam sayı).
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

// ---------- 2 + 6. Saat kuralı ve ekran/veritabanı uyumu ----------

const seasonDate = futureDate(20);
const actA = await seedActivity('saat', { date: seasonDate, time: '14:00' });
await addRule(actA.id, { label: 'Öğleden sonra', startTime: '12:00', endTime: '17:00',
  priceTRY: 1400 });

{
  const { context, page } = await freshPage();
  const phone = testPhone('5701').display;

  await page.goto(`${BASE}/rezervasyon/${actA.slug}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.locator('button[aria-pressed]:not([disabled])').filter({ hasText: 'yer' })
    .first().click();
  await page.waitForTimeout(300);

  const shown = await shownTotal(page);
  check(
    'ekranda saat tarifesi görünüyor (2 kişi × 1400 = 2800)',
    shown === 2800,
    `ekran: ${shown}`
  );

  const labelled = await page.locator('body').innerText();
  check(
    'hangi kuralın uygulandığı EKRANDA yazıyor',
    labelled.includes('Öğleden sonra'),
    'kural adı görünmüyorsa işletme fiyatın neden değiştiğini açıklayamaz'
  );

  await context.close();

  const { context: c2, page: p2 } = await freshPage();
  const result = await book(p2, { baseUrl: BASE, slug: actA.slug,
    name: `Saat Tarifesi ${tag}`, phone });

  if (result.code) {
    const row = await store.get('SELECT total_try FROM bookings WHERE code = ?', [result.code]);
    // Karşılaştırma EKRANDAN OKUNAN sayıyla: sabit bir beklenen değere
    // bakmak, ikisi birden yanlışsa testi geçirirdi.
    check(
      'VERİTABANINA yazılan tutar ekranda yazanla AYNI',
      Number(row.total_try) === shown && shown === 2800,
      `kayıt: ${row?.total_try}, ekran: ${shown}`
    );
  } else {
    check('VERİTABANINA yazılan tutar ekranda yazanla AYNI', false, result.error);
  }
  await c2.close();
}

// ---------- 7. İstemciden gelen tutara güvenilmiyor ----------

const actB = await seedActivity('guven', { date: futureDate(21), time: '14:00' });
await addRule(actB.id, { label: 'Öğleden sonra', startTime: '12:00', endTime: '17:00',
  priceTRY: 1400 });

{
  const { context, page } = await freshPage();
  const result = await book(page, {
    baseUrl: BASE,
    slug: actB.slug,
    name: `Sahte Tutar ${tag}`,
    phone: testPhone('5702').display,
    beforeSubmit: async (p) => {
      await p.evaluate(() => {
        const form = document.querySelector('form');
        if (!form) return;
        for (const name of ['total', 'totalTRY', 'tutar', 'priceTRY']) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = '1';
          form.appendChild(input);
        }
      });
    },
  });

  if (result.code) {
    const row = await store.get('SELECT total_try FROM bookings WHERE code = ?', [result.code]);
    check(
      'forma elle yazılan TUTAR yok sayılıyor — sunucu yeniden hesaplıyor',
      Number(row.total_try) === 2800,
      `kayıt: ${row?.total_try} (forma 1 TL enjekte edildi)`
    );
  } else {
    check('forma elle yazılan TUTAR yok sayılıyor', false, result.error);
  }
  await context.close();
}

// ---------- 5. Grup indirimi uçtan uca ----------

const actC = await seedActivity('grup', { date: futureDate(22), time: '10:00' });
await addDiscount(actC.id, 4, 10);
await addDiscount(actC.id, 8, 20);

{
  const { context, page } = await freshPage();
  const result = await book(page, {
    baseUrl: BASE,
    slug: actC.slug,
    name: `Grup ${tag}`,
    phone: testPhone('5703').display,
    people: 5,
  });

  if (result.code) {
    const row = await store.get('SELECT total_try, adults FROM bookings WHERE code = ?',
      [result.code]);
    check(
      '5 kişilik grup %10 indirimli kaydediliyor (5000 − 500 = 4500)',
      Number(row.adults) === 5 && Number(row.total_try) === 4500,
      `${row?.adults} kişi, ${row?.total_try} TL`
    );
  } else {
    check('5 kişilik grup %10 indirimli kaydediliyor', false, result.error);
  }
  await context.close();
}

// ---------- 4. Sezon dışı ----------

const actD = await seedActivity('sezon', { date: futureDate(23), time: '10:00' });
// Sezon GEÇMİŞTE bitiyor: bugünden sonraki hiçbir tarihe uymamalı.
await addRule(actD.id, { label: 'Geçen sezon', validFrom: '2020-06-01',
  validUntil: '2020-09-15', priceTRY: 2500 });

{
  const { context, page } = await freshPage();
  const result = await book(page, { baseUrl: BASE, slug: actD.slug,
    name: `Sezon Disi ${tag}`, phone: testPhone('5704').display });

  if (result.code) {
    const row = await store.get('SELECT total_try FROM bookings WHERE code = ?', [result.code]);
    check(
      'SEZONU GEÇMİŞ kural uygulanmıyor — liste fiyatı geçerli (2 × 1000)',
      Number(row.total_try) === 2000,
      `kayıt: ${row?.total_try}`
    );
  } else {
    check('SEZONU GEÇMİŞ kural uygulanmıyor', false, result.error);
  }
  await context.close();
}

// ---------- 3. Gün maskesi ----------
//
// Kural YALNIZCA slotun düştüğü günü kapsıyor; ertesi gün kapsamıyor. Aynı
// kuralın iki ayrı tarihte farklı davrandığını görmek, maskenin gerçekten
// okunduğunu kanıtlıyor.

{
  const dayOn = futureDate(24);
  const dayOff = futureDate(25);

  const actE = await seedActivity('gun-acik', { date: dayOn, time: '10:00' });
  await addRule(actE.id, { label: 'O gün', weekdays: weekdayBit(dayOn), priceTRY: 1700 });

  const actF = await seedActivity('gun-kapali', { date: dayOff, time: '10:00' });
  await addRule(actF.id, { label: 'Başka gün', weekdays: weekdayBit(dayOn), priceTRY: 1700 });

  const onQuote = quote({
    basePrice: BASE_PRICE,
    rules: [{ id: 'x', label: 'O gün', priority: 0, validFrom: null, validUntil: null,
      weekdays: weekdayBit(dayOn), startTime: null, endTime: null, priceTRY: 1700 }],
    discounts: [], date: dayOn, time: '10:00', people: 1,
  });
  const offQuote = quote({
    basePrice: BASE_PRICE,
    rules: [{ id: 'x', label: 'O gün', priority: 0, validFrom: null, validUntil: null,
      weekdays: weekdayBit(dayOn), startTime: null, endTime: null, priceTRY: 1700 }],
    discounts: [], date: dayOff, time: '10:00', people: 1,
  });

  check(
    'gün maskesi uyan güne uygulanıyor, uymayana uygulanmıyor',
    onQuote.unitPrice === 1700 && offQuote.unitPrice === BASE_PRICE,
    `${dayOn} → ${onQuote.unitPrice}, ${dayOff} → ${offQuote.unitPrice}`
  );

  await store.run('DELETE FROM price_rules WHERE activity_id IN (?, ?)', [actE.id, actF.id]);
  await store.run('DELETE FROM slots WHERE activity_id IN (?, ?)', [actE.id, actF.id]);
  await store.run('DELETE FROM activities WHERE id IN (?, ?)', [actE.id, actF.id]);
}

// ---------- 8. Manuel kayıt aynı tarifeyi kullanıyor ----------

const actG = await seedActivity('manuel', { date: futureDate(26), time: '14:00' });
await addRule(actG.id, { label: 'Öğleden sonra', startTime: '12:00', endTime: '17:00',
  priceTRY: 1400 });
await addDiscount(actG.id, 4, 10);

// Manuel kayıt ve acente eylemleri aynı iki çağrıyı yapıyor: `loadPricing`
// sonra `quote`. Burada o çift doğrudan çağrılıp müşteri ekranının verdiği
// sonuçla karşılaştırılıyor — üç yolun tek kaynaktan beslendiğinin kanıtı.
{
  const { loadPricing } = await import('../lib/db/pricing.ts');
  const pricing = await loadPricing(actG.id);
  const priced = quote({
    basePrice: BASE_PRICE,
    rules: pricing.rules,
    discounts: pricing.discounts,
    date: actG.date,
    time: actG.time,
    people: 4,
  });

  check(
    'manuel/acente yolunun okuduğu tarife aynı sonucu veriyor (4 × 1400 − %10 = 5040)',
    priced.total === 5040,
    `${priced.total}`
  );
  check(
    'kurallar veritabanından SIRALI geliyor',
    pricing.rules.length === 1 && pricing.rules[0].label === 'Öğleden sonra',
    `${pricing.rules.length} kural`
  );
}

// ---------- 9 + 10. Yetki ve doğrulama ----------

// Sahiplik kontrolü SQL'de: silme koşulunda `activity_id` var. Sunucu eylemi
// zaten ilanın işletmeye ait olduğunu doğruluyor ama o kontrol atlansa bile
// başka bir ilanın kuralı silinememeli — kimlik tahmin edilebilir olsaydı
// tek kilit yeterli olmazdı.
{
  const { createPriceRule, deletePriceRule, listPriceRules } = await import('../lib/db/pricing.ts');

  const ruleId = await createPriceRule({
    activityId: actD.id,
    label: `Sahiplik ${tag}`,
    priority: 0,
    validFrom: null,
    validUntil: null,
    weekdays: 127,
    startTime: null,
    endTime: null,
    priceTRY: 900,
  });

  const wrong = await deletePriceRule(ruleId, actA.id);
  const stillThere = (await listPriceRules(actD.id)).some((r) => r.id === ruleId);
  check(
    'BAŞKA ilanın kimliğiyle kural silinemiyor',
    wrong === false && stillThere,
    `silme sonucu: ${wrong}, kural duruyor: ${stillThere}`
  );

  const right = await deletePriceRule(ruleId, actD.id);
  check('doğru ilanla silme çalışıyor — kontrol her şeyi engellemiyor', right === true);
}

// Sıralama: öncelik önce, eşitlikte eskisi önce. Ekrandaki liste ile hesabın
// tarama sırası AYNI olmak zorunda; ayrılsaydı işletme "üstteki kural
// geçerli" sanır ve alttaki uygulanırdı.
{
  const { listPriceRules } = await import('../lib/db/pricing.ts');

  await addRule(actD.id, { label: 'Düşük öncelik', priceTRY: 100, priority: 1, ageMs: -20000 });
  await addRule(actD.id, { label: 'Yüksek öncelik', priceTRY: 200, priority: 9, ageMs: -10000 });
  await addRule(actD.id, { label: 'Aynı öncelik yeni', priceTRY: 300, priority: 9, ageMs: 0 });

  const order = (await listPriceRules(actD.id)).map((r) => r.label);
  check(
    'kurallar öncelik DESC, eşitlikte eskiden yeniye sıralanıyor',
    order[0] === 'Yüksek öncelik' &&
      order[1] === 'Aynı öncelik yeni' &&
      order[2] === 'Düşük öncelik',
    order.join(' → ')
  );

  await store.run('DELETE FROM price_rules WHERE activity_id = ?', [actD.id]);
}

{
  const { context, page } = await freshPage();
  // Girişsiz istek: fiyat ekranı açılmamalı.
  await page.goto(`${BASE}/isletme/aktiviteler/${actA.id}/fiyat`, { waitUntil: 'networkidle' });
  check(
    'giriş yapmadan fiyat ekranına ULAŞILAMIYOR',
    !page.url().includes('/fiyat'),
    page.url()
  );
  await context.close();
}

// Şema kısıtları: geçersiz kural veritabanına GİREMİYOR. Sunucu eylemi bunu
// zaten anlaşılır bir hatayla karşılıyor; buradaki kontrol, eylem atlansa
// bile verinin bozulamayacağını gösteriyor.
{
  let rejected = 0;

  for (const bad of [
    { label: 'Gün yok', weekdays: 0, priceTRY: 100 },
    { label: 'Maske taşkın', weekdays: 200, priceTRY: 100 },
    { label: 'Eksi fiyat', weekdays: 127, priceTRY: -1 },
  ]) {
    try {
      await addRule(actA.id, bad);
    } catch {
      rejected++;
    }
  }

  check('geçersiz fiyat kuralı ŞEMA tarafından reddediliyor', rejected === 3, `${rejected}/3`);

  let discountRejected = 0;
  for (const [minPeople, percent] of [[1, 10], [4, 60], [4, 0]]) {
    try {
      await addDiscount(actA.id, minPeople, percent);
    } catch {
      discountRejected++;
    }
  }
  check('geçersiz grup indirimi ŞEMA tarafından reddediliyor', discountRejected === 3,
    `${discountRejected}/3`);

  // Aynı eşik iki kez: ikinci kayıt hata değil GÜNCELLEME olmalı.
  const { upsertGroupDiscount } = await import('../lib/db/pricing.ts');
  await upsertGroupDiscount({ activityId: actC.id, minPeople: 4, percent: 15 });
  const rows = await store.all(
    'SELECT percent FROM group_discounts WHERE activity_id = ? AND min_people = 4',
    [actC.id]
  );
  check(
    'aynı eşik ikinci kez girilince yüzde GÜNCELLENİYOR, ikinci satır açılmıyor',
    rows.length === 1 && Number(rows[0].percent) === 15,
    `${rows.length} satır, %${rows[0]?.percent}`
  );
}

await browser.close();

// Temizlik
const slugs = [actA.slug, actB.slug, actC.slug, actD.slug, actG.slug];
const ids = [actA.id, actB.id, actC.id, actD.id, actG.id];
const list = ids.map(() => '?').join(',');

// Ödeme ve hak ediş kayıtları rezervasyona bağlı; sunucu `PAYMENT_PROVIDER=fake`
// ile koşuyorsa bu satırlar açılıyor ve rezervasyondan önce silinmeleri
// gerekiyor — yoksa yabancı anahtar temizliği durduruyor.
const slugList = slugs.map(() => '?').join(',');
const bookingScope = `SELECT id FROM bookings WHERE activity_slug IN (${slugList})`;

await store.run(`DELETE FROM payouts WHERE booking_id IN (${bookingScope})`, slugs);
await store.run(`DELETE FROM payments WHERE booking_id IN (${bookingScope})`, slugs);
await store.run(`DELETE FROM bookings WHERE activity_slug IN (${slugList})`, slugs);
await store.run(`DELETE FROM price_rules WHERE activity_id IN (${list})`, ids);
await store.run(`DELETE FROM group_discounts WHERE activity_id IN (${list})`, ids);
await store.run(`DELETE FROM slots WHERE activity_id IN (${list})`, ids);
await store.run(`DELETE FROM activities WHERE id IN (${list})`, ids);
await store.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
