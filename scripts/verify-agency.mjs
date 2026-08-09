/**
 * Acente portalının testi.
 *
 * Acente rezervasyonunun var olma sebebi komisyon değil, **MÜSAİTLİĞİN DOĞRU
 * OLMASI**: otelden alınan yer sisteme girmezse RASTLA müşterisine boş görünen
 * saat aslında doludur ve iki grup aynı anda iskeleye gelir. Bu yüzden buradaki
 * en önemli iddia şu: acente rezervasyonu AYNI kapasiteyi tüketiyor ve RASTLA
 * tarafındaki müsaitlik anında düşüyor.
 *
 * Sınananlar:
 *   1. Acente rezervasyonu aynı slotu tüketiyor; müşteri tarafındaki kalan yer
 *      ANINDA düşüyor (aynı sorgudan okunuyor, ayrı bir sayaç yok).
 *   2. Acente rezervasyonu ÖDEME ve HAK EDİŞ kaydı ÜRETMİYOR.
 *   3. `source='agency'` ve `agency_id` kaydediliyor; işletme "hangi acente"
 *      sorusunu görebiliyor.
 *   4. Acente BAŞKA bir acentenin rezervasyonunu göremiyor — hem ekranda hem
 *      veri katmanında. (Çapraz iptal denemesi, listeleme ile AYNI
 *      `agency_id` karşılaştırmasına dayanıyor; burada sınanan o
 *      karşılaştırmanın kendisi.)
 *   5. Acente oturumu `/isletme` ve `/yonetim`'e GİRMİYOR — ayrı çerez, ayrı
 *      alan; bu bir kontrol meselesi değil, yapısal.
 *   6. Askıya alınmış acentenin personeli giremiyor (hesabı aktif olsa bile).
 *   7. Kapasite dolduğunda acente de reddediliyor — kısayol yok.
 *   8. Acente iptali kapasiteyi geri veriyor.
 *
 * Kullanım:
 *   npm start > server.log &
 *   node scripts/verify-agency.mjs
 */
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { db as connect } from '../lib/db/index.mjs';
import { hashPassword } from '../lib/password.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const OPERATOR = 'buyukcekmece-wsc';

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const store = await connect();

const now = new Date().toISOString();
const tag = Date.now();
const PASSWORD = 'acente-test-parolasi-2026';

// ---------------------------------------------------------------- kurulum

async function makeAgency(label) {
  const id = randomUUID();
  await store.run(
    `INSERT INTO agencies (id, name, contact_email, status, created_at)
     VALUES (?, ?, ?, 'active', ?)`,
    [id, `${label} ${tag}`, `${label}-${tag}@ornek.local`, now]
  );

  const userId = randomUUID();
  const email = `${label}-${tag}@acente.local`;
  await store.run(
    `INSERT INTO agency_users (id, agency_id, email, name, password_hash, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    [userId, id, email, `${label} Personeli`, hashPassword(PASSWORD), now]
  );

  return { id, userId, email, name: `${label} ${tag}` };
}

const agencyA = await makeAgency('otel-a');
const agencyB = await makeAgency('otel-b');

// Aktivite: kapasitesi KASTEN küçük, dolma davranışı sınanabilsin.
const activityId = randomUUID();
const slug = `acente-test-${tag}`;
const day = '2026-10-01';

await store.run(
  `INSERT INTO activities (id, operator_id, slug, title, category, price_try, duration_minutes,
     location_name, capacity_mode, status, created_at)
   VALUES (?, ?, ?, ?, 'jet-ski', 400, 30, 'Sahil', 'per_person', 'published', ?)`,
  [activityId, OPERATOR, slug, `Acente Testi ${tag}`, now]
);

const slotId = randomUUID();
await store.run(
  `INSERT INTO slots (id, activity_id, slot_date, slot_time, capacity, booked, status, created_at)
   VALUES (?, ?, ?, '11:00', 4, 0, 'open', ?)`,
  [slotId, activityId, day, now]
);

// ---------------------------------------------------------------- tarayıcı

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

async function freshPage() {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function loginAgency(page, email) {
  await page.goto(`${BASE}/acente`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await page.waitForURL(/\/acente\/ara/, { timeout: 15000 });
}

async function bookAs(page, people, guest) {
  await page.goto(`${BASE}/acente/rezervasyon/${slug}?slot=${slotId}`, {
    waitUntil: 'networkidle',
  });
  await page.fill('#name', guest);
  await page.fill('#phone', `0553${String(tag).slice(-7)}`);
  await page.fill('#people', String(people));
  await page.getByRole('button', { name: 'Yeri Tut' }).click();
  await page.waitForSelector('text=Misafirin bilet kodu', { timeout: 15000 }).catch(() => null);
  return page.locator('body').innerText();
}

const bookedBefore = Number(
  (await store.get('SELECT booked FROM slots WHERE id = ?', [slotId])).booked
);

let codeA = null;

{
  const { context, page } = await freshPage();
  await loginAgency(page, agencyA.email);

  const text = await bookAs(page, 2, 'Acente Misafiri A');
  const match = text.match(/[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4})+/);
  codeA = match?.[0] ?? null;

  check('acente misafir adına yer tutabiliyor', codeA !== null, codeA ?? text.slice(0, 120));
  await context.close();
}

// ---------- Kapasite: aynı sayaç, anında düşüyor ----------

const slotAfter = await store.get('SELECT booked FROM slots WHERE id = ?', [slotId]);
check(
  'acente rezervasyonu AYNI slot sayacını tüketiyor',
  Number(slotAfter.booked) === bookedBefore + 2,
  `${bookedBefore} → ${slotAfter.booked}`
);

{
  // Müşteri tarafındaki müsaitlik: acente kaydı için ayrı bir kontenjan yok,
  // aynı satırdan okunuyor. Ayrı olsaydı iki sayacın arası er geç açılırdı.
  const { listSlots } = await import('../lib/db/slots.ts');
  const slots = await listSlots(activityId, day);
  const slot = slots.find((s) => s.id === slotId);
  check(
    'RASTLA tarafındaki kalan yer ANINDA düşüyor',
    slot.remaining === 2,
    `kalan: ${slot.remaining} (kapasite 4)`
  );
}

// ---------- Ödeme ve hak ediş kaydı ÜRETİLMİYOR ----------

const booking = await store.get('SELECT * FROM bookings WHERE code = ?', [codeA]);

check(
  'acente rezervasyonu source=agency ve agency_id taşıyor',
  booking.source === 'agency' && booking.agency_id === agencyA.id,
  `${booking.source} / ${booking.agency_id === agencyA.id ? 'doğru acente' : 'YANLIŞ acente'}`
);
check(
  'acente rezervasyonu tesiste ödemeli',
  booking.payment_mode === 'onsite',
  booking.payment_mode
);
check(
  'acente rezervasyonu doğrudan GEÇERLİ bir bilet — ödeme akışı yok',
  booking.status === 'confirmed',
  booking.status
);

const payment = await store.get('SELECT COUNT(*) AS n FROM payments WHERE booking_id = ?', [
  booking.id,
]);
check(
  'acente rezervasyonu ÖDEME kaydı ÜRETMİYOR',
  Number(payment.n) === 0,
  `ödeme satırı: ${payment.n}`
);

const payout = await store.get('SELECT COUNT(*) AS n FROM payouts WHERE booking_id = ?', [
  booking.id,
]);
check(
  'acente rezervasyonu HAK EDİŞ kaydı ÜRETMİYOR — komisyon doğmuyor',
  Number(payout.n) === 0,
  `hak ediş satırı: ${payout.n}`
);

// ---------- Acente başka acentenin kaydını GÖREMİYOR ----------

{
  const { context, page } = await freshPage();
  await loginAgency(page, agencyB.email);

  await page.goto(`${BASE}/acente/rezervasyonlarim`, { waitUntil: 'networkidle' });
  const text = await page.locator('body').innerText();
  check(
    'acente BAŞKA acentenin rezervasyonunu GÖRMÜYOR',
    !text.includes(codeA),
    text.includes(codeA) ? 'GÖRÜYOR' : 'görmüyor'
  );

  check(
    'başka acentenin rezervasyonu için iptal düğmesi de YOK',
    (await page.getByRole('button', { name: 'İptal et' }).count()) === 0
  );

  await context.close();
}

{
  // Karşı kontrol: kayıt GERÇEKTEN var ve A'nın listesinde görünüyor. Bu
  // olmadan "B görmüyor" iddiası boş bir listeden de gelebilirdi — yani test
  // yanlış sebeple geçerdi.
  const { context, page } = await freshPage();
  await loginAgency(page, agencyA.email);
  await page.goto(`${BASE}/acente/rezervasyonlarim`, { waitUntil: 'networkidle' });

  const text = await page.locator('body').innerText();
  check(
    'aynı kayıt KENDİ acentesinin listesinde GÖRÜNÜYOR',
    text.includes(codeA),
    text.includes(codeA) ? 'görünüyor' : 'GÖRÜNMÜYOR'
  );

  await context.close();
}

// ---------- Acente oturumu işletme ve yönetim paneline GİRMİYOR ----------

{
  const { context, page } = await freshPage();
  await loginAgency(page, agencyA.email);

  await page.goto(`${BASE}/isletme/bugun`, { waitUntil: 'networkidle' });
  check(
    'acente oturumu /isletme/bugun ekranına GİREMİYOR',
    !page.url().includes('/isletme/bugun'),
    page.url()
  );

  await page.goto(`${BASE}/yonetim/isletmeler`, { waitUntil: 'networkidle' });
  check(
    'acente oturumu /yonetim ekranına GİREMİYOR',
    !page.url().includes('/yonetim/isletmeler'),
    page.url()
  );

  await context.close();
}

// ---------- Kapasite dolunca acente de reddediliyor ----------

{
  const { context, page } = await freshPage();
  await loginAgency(page, agencyB.email);

  // Kalan 2 yer; 3 kişi isteniyor.
  //
  // Formdaki `max` niteliği KALDIRILIYOR: tarayıcı doğrulaması gönderimi
  // engellese testin geçtiği yer sunucu değil, tarayıcı olurdu — ve arayüzü
  // atlayan biri için hiçbir şey kanıtlanmazdı. Sınanan şey sunucunun
  // reddetmesi.
  await page.goto(`${BASE}/acente/rezervasyon/${slug}?slot=${slotId}`, {
    waitUntil: 'networkidle',
  });
  await page.evaluate(() => document.querySelector('#people')?.removeAttribute('max'));
  await page.fill('#name', 'Acente Misafiri B');
  await page.fill('#phone', `0553${String(tag).slice(-7)}`);
  await page.fill('#people', '3');
  await page.getByRole('button', { name: 'Yeri Tut' }).click();
  await page.waitForSelector('[role="alert"]', { timeout: 15000 }).catch(() => null);
  const text = await page.locator('body').innerText();
  check(
    'kalan yerden fazlası isteniyor — acenteye de KISAYOL YOK',
    /doldu|yeterli|kapalı/i.test(text),
    text.match(/Bu saat az önce doldu[^\n]*|Bu saatte yeterli[^\n]*/)?.[0] ??
      'hata mesajı bulunamadı'
  );

  const slot = await store.get('SELECT booked FROM slots WHERE id = ?', [slotId]);
  check(
    'reddedilen istek kapasiteyi BOZMUYOR',
    Number(slot.booked) === 2,
    `tutulan: ${slot.booked}`
  );

  await context.close();
}

// ---------- İptal kapasiteyi geri veriyor ----------

{
  const { context, page } = await freshPage();
  await loginAgency(page, agencyA.email);

  await page.goto(`${BASE}/acente/rezervasyonlarim`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'İptal et' }).first().click();
  await page.getByRole('button', { name: 'Onayla' }).first().click();
  await page.waitForSelector('text=serbest bırakıldı', { timeout: 15000 }).catch(() => null);

  const slot = await store.get('SELECT booked FROM slots WHERE id = ?', [slotId]);
  check(
    'acente iptali kapasiteyi GERİ VERİYOR',
    Number(slot.booked) === 0,
    `tutulan: ${slot.booked}`
  );

  const cancelled = await store.get('SELECT status FROM bookings WHERE code = ?', [codeA]);
  check('iptal edilen kayıt cancelled oluyor', cancelled.status === 'cancelled', cancelled.status);

  await context.close();
}

// ---------- Askıya alınmış acentenin personeli giremiyor ----------

await store.run("UPDATE agencies SET status = 'suspended' WHERE id = ?", [agencyA.id]);

{
  const { context, page } = await freshPage();
  await page.goto(`${BASE}/acente`, { waitUntil: 'networkidle' });
  await page.fill('#email', agencyA.email);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await page.waitForTimeout(1500);

  const text = await page.locator('body').innerText();
  check(
    'ASKIYA ALINMIŞ acentenin personeli giremiyor — hesabı aktif olsa bile',
    !page.url().includes('/acente/ara') && /askıya alınmış/i.test(text),
    page.url()
  );

  await context.close();
}

await browser.close();

// Temizlik
await store.run('DELETE FROM bookings WHERE agency_id IN (?, ?)', [agencyA.id, agencyB.id]);
await store.run('DELETE FROM slots WHERE activity_id = ?', [activityId]);
await store.run('DELETE FROM activities WHERE id = ?', [activityId]);
await store.run('DELETE FROM agency_users WHERE agency_id IN (?, ?)', [agencyA.id, agencyB.id]);
await store.run('DELETE FROM agencies WHERE id IN (?, ?)', [agencyA.id, agencyB.id]);
await store.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
