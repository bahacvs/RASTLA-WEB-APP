/**
 * Uçtan uca işletme akışı testi.
 *
 * Kapsanan senaryo (planın asıl senaryosu):
 *   işletme aktivite oluşturur -> "08:00'dan 18:00'e, 15 dakikada bir, 4 kişi"
 *   takvimi tanımlar -> aktiviteyi yayına alır -> müşteri o slottan rezervasyon
 *   yapar -> slot dolar -> sonraki rezervasyon reddedilir -> bilet onaylanır.
 *
 * Kullanım: npm start & node scripts/verify-operator-flow.mjs
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { emailFor, ensureTestAccounts, loginAs } from './lib/test-accounts.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

// Bilinen parolalı test hesapları; seed'in ürettiği parolalar rastgeledir.
await ensureTestAccounts();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const unique = Date.now().toString().slice(-6);
const TITLE = `Test Jet Ski ${unique}`;

// ---------- İşletme: giriş ----------
const operator = await browser.newContext({ viewport: { width: 390, height: 844 } });
const op = await operator.newPage();

await loginAs(op, BASE, 'buyukcekmece-wsc');
check('işletme girişi e-posta ve parolayla yapılabiliyor', true);

// ---------- Aktivite oluştur ----------
await op.goto(`${BASE}/isletme/aktiviteler/yeni`, { waitUntil: 'networkidle' });
await op.fill('#title', TITLE);
await op.selectOption('#category', 'jet-ski');
await op.fill('#priceTRY', '1000');
await op.fill('#durationMinutes', '30');
await op.fill('#location', 'Test Sahili');
await op.fill('#lat', '41.0155');
await op.fill('#lng', '28.5862');
// Her müşteriye bir araç: kapasite rezervasyon başına sayılsın.
await op.getByRole('radio', { name: /Rezervasyon sayılır/ }).check();
await op.getByRole('button', { name: /Oluştur ve Takvime Geç/ }).click();

await op.waitForURL(/\/isletme\/aktiviteler\/.+\/takvim/, { timeout: 15000 });
const activityId = new URL(op.url()).pathname.split('/')[3];
check('aktivite oluşturuldu ve takvime yönlendirildi', Boolean(activityId));

// ---------- Takvim kuralı: 08:00–18:00 / 15 dk / 4 kişi ----------
await op.fill('#startTime', '08:00');
await op.fill('#endTime', '18:00');
await op.fill('#intervalMinutes', '15');
await op.fill('#capacity', '4');

const preview = await op.locator('text=/Bu kural günde/').innerText();
check('önizleme günde 40 slot diyor', preview.includes('40 slot'), preview.replace(/\n/g, ' '));

await op.getByRole('button', { name: /Kuralı Ekle/ }).click();
await op.waitForTimeout(2500);

const message = await op.locator('text=/slot eklendi/').innerText();
check('slotlar üretildi', /\d+ slot eklendi/.test(message), message);

const slotButtons = await op.locator('form button:has-text(":")').count();
check('günün slotları listeleniyor', slotButtons >= 40, `${slotButtons} slot`);

// ---------- Yayına al ----------
await op.goto(`${BASE}/isletme/aktiviteler`, { waitUntil: 'networkidle' });
const card = op.locator('li').filter({ hasText: TITLE });
await card.getByRole('button', { name: 'Yayına Al' }).click();
await op.waitForTimeout(1500);
check(
  'aktivite yayına alındı',
  await op.locator('li').filter({ hasText: TITLE }).getByText('Yayında', { exact: true }).isVisible()
);

// ---------- Müşteri: aramada görünüyor mu ----------
const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
const cp = await customer.newPage();

await cp.goto(`${BASE}/ara?q=${encodeURIComponent(`Test Jet Ski ${unique}`)}`, {
  waitUntil: 'networkidle',
});
check('yeni aktivite aramada bulunuyor', await cp.getByText(TITLE).first().isVisible());

// Slug'ı karttan al.
const href = await cp.locator(`a[href^="/aktivite/"]`).first().getAttribute('href');
const slug = href.split('/').pop();

// ---------- Rezervasyon: kapasiteyi doldur ----------
// capacity_mode = per_booking olduğu için her rezervasyon 1 yer düşer.
async function book(page, name, phone) {
  await page.goto(`${BASE}/rezervasyon/${slug}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const slotButton = page.locator('button[aria-pressed]').filter({ hasText: 'yer' }).first();
  if ((await slotButton.count()) === 0) return { full: true };

  const before = await slotButton.innerText();
  await slotButton.click();
  await page.getByLabel('Ad Soyad').fill(name);
  await page.getByLabel('Telefon').fill(phone);
  await page.getByRole('button', { name: 'Rezervasyonu Tamamla' }).first().click();

  try {
    await page.waitForURL(/\/bilet\//, { timeout: 15000 });
    return { code: decodeURIComponent(new URL(page.url()).pathname.split('/').pop()), before };
  } catch {
    return { error: await page.locator('[role="alert"]').innerText() };
  }
}

const first = await book(cp, 'Test Müşteri 1', '0532 000 00 01');
check('ilk rezervasyon oluşturuldu', Boolean(first.code), first.code ?? first.error);
check('slotta kalan yer gösteriliyordu', /\d+ yer/.test(first.before ?? ''), first.before);

// İlk slotun kalan 3 yerini de doldur.
const others = [];
for (let i = 2; i <= 4; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  others.push(await book(page, `Test Müşteri ${i}`, `0532 000 00 0${i}`));
  await ctx.close();
}
check('kalan 3 yer de doldu', others.every((r) => Boolean(r.code)), JSON.stringify(others.map((r) => r.code ?? r.error)));

// Beşinci deneme: aynı slot artık dolu olmalı, arayüz başka slot sunmalı.
const fifthCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const fifth = await fifthCtx.newPage();
await fifth.goto(`${BASE}/rezervasyon/${slug}`, { waitUntil: 'networkidle' });
await fifth.waitForTimeout(400);

const firstSlotText = await fifth.locator('button[aria-pressed]').filter({ hasText: /yer|Dolu/ }).first().innerText();
check(
  'dolan slot arayüzde "Dolu" olarak işaretleniyor',
  firstSlotText.includes('Dolu'),
  firstSlotText.replace(/\n/g, ' ')
);
await fifthCtx.close();

// ---------- Bilet onayı ----------
await op.goto(`${BASE}/isletme/tara`, { waitUntil: 'networkidle' });
await op.fill('#code', first.code);
await op.getByRole('button', { name: 'Onayla' }).click();
await op.waitForTimeout(1500);
check('bilet onaylandı', await op.getByText('Onaylandı', { exact: true }).isVisible());

await op.fill('#code', first.code);
await op.getByRole('button', { name: 'Onayla' }).click();
await op.waitForTimeout(1500);
check('aynı bilet ikinci kez onaylanamıyor', await op.getByText('daha önce kullanılmış').isVisible());

// ---------- İşletme rezervasyon listesi ----------
await op.goto(`${BASE}/isletme/rezervasyonlar`, { waitUntil: 'networkidle' });
check('rezervasyonlar listesinde görünüyor', await op.getByText(first.code).isVisible());
check(
  'bileti kimin onayladığı listede yazıyor',
  await op.getByText('Test Sahibi onayladı').first().isVisible()
);

await operator.close();

// ---------- Yetki sınırı: personel aktivite yönetemez ----------
//
// Menüde bağlantının gizli olması yetkilendirme değildir; adres doğrudan
// yazıldığında da sunucu tarafından engellenmeli.
const staffCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const sp = await staffCtx.newPage();
await loginAs(sp, BASE, 'buyukcekmece-wsc', 'staff');

check(
  'personel menüsünde Aktiviteler yok',
  (await sp.getByRole('link', { name: 'Aktiviteler' }).count()) === 0
);
check('personel menüsünde Ekip yok', (await sp.getByRole('link', { name: 'Ekip' }).count()) === 0);

await sp.goto(`${BASE}/isletme/aktiviteler`, { waitUntil: 'networkidle' });
check(
  'personel aktivite sayfasına doğrudan giremiyor',
  /\/isletme\/tara/.test(sp.url()),
  sp.url()
);

await sp.goto(`${BASE}/isletme/ekip`, { waitUntil: 'networkidle' });
check('personel ekip sayfasına doğrudan giremiyor', /\/isletme\/tara/.test(sp.url()), sp.url());

await sp.goto(`${BASE}/isletme/rezervasyonlar`, { waitUntil: 'networkidle' });
check(
  'personel rezervasyonları görebiliyor',
  /\/isletme\/rezervasyonlar/.test(sp.url()),
  sp.url()
);
await staffCtx.close();

// ---------- Oturum, hesap askıya alınınca anında düşer ----------
//
// İşletme kimliği çereze gömülmediği, her istekte hesaptan türetildiği için
// askıya alma elindeki çerezi de geçersiz kılar.
const suspendCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const susp = await suspendCtx.newPage();
await loginAs(susp, BASE, 'buyukcekmece-wsc', 'staff');

execFileSync(
  process.execPath,
  ['scripts/operator-account.mjs', 'status', emailFor('buyukcekmece-wsc', 'staff'), 'suspended'],
  { encoding: 'utf8' }
);

await susp.goto(`${BASE}/isletme/tara`, { waitUntil: 'networkidle' });
check(
  'askıya alınan hesabın mevcut oturumu anında geçersiz',
  /\/isletme$/.test(susp.url()),
  susp.url()
);
await suspendCtx.close();

// Sonraki koşumlar için geri aç.
execFileSync(
  process.execPath,
  ['scripts/operator-account.mjs', 'status', emailFor('buyukcekmece-wsc', 'staff'), 'active'],
  { encoding: 'utf8' }
);

await customer.close();
await browser.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
