/**
 * Manuel rezervasyonun testi.
 *
 * Bu özelliğin varlık sebebi komisyon değil MÜSAİTLİĞİN DOĞRU OLMASI:
 * telefondan alınan bir rezervasyon sisteme girilmezse, RASTLA müşterisine
 * boş görünen saat aslında doludur ve iki grup aynı saatte iskeleye gelir.
 *
 * Bu yüzden testin merkezindeki iddia şu: manuel kayıt AYNI kapasiteyi
 * tüketiyor ve RASTLA tarafındaki müsaitlik anında düşüyor. Ayrı bir kısayol
 * açılsaydı özellik, çözmek için var olduğu problemi geri getirirdi.
 *
 * Sınananlar:
 *   1. Manuel kayıt slot kapasitesini düşürüyor.
 *   2. Müşteri tarafındaki müsaitlik de aynı anda düşüyor.
 *   3. Komisyon üretmiyor: ödeme kaydı açılmıyor, payment_mode 'onsite'.
 *   4. Kaynak ve kaydı açan personel saklanıyor ("kim ekledi" sorusu).
 *   5. Saha personeline manuel kayıt formu GÖSTERİLMİYOR.
 *
 * Sınır: sunucu eyleminin saha personelini reddettiği burada arayüz
 * üzerinden sınanamıyor (form çizilmediği için gönderilecek bir şey yok).
 * O güvence `requireCapability('rezervasyon.manuel')` çağrısında ve rol
 * matrisi scripts/verify-permissions.mjs içinde sınanıyor.
 *
 * Kullanım: npm start & node scripts/verify-manual-booking.mjs
 */
import { chromium } from 'playwright';
import { ensureTestAccounts, loginAs } from './lib/test-accounts.mjs';
import { db } from '../lib/db/index.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const OPERATOR = 'buyukcekmece-wsc';

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

await ensureTestAccounts();
const client = await db();

// Bu işletmenin yayındaki bir aktivitesi ve yarın için açık bir slotu.
const activity = await client.get(
  `SELECT id, slug, title, price_try FROM activities
    WHERE operator_id = ? AND status = 'published' LIMIT 1`,
  [OPERATOR]
);

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const date = tomorrow.toISOString().slice(0, 10);

const slot = await client.get(
  `SELECT id, slot_time, capacity, booked FROM slots
    WHERE activity_id = ? AND slot_date = ? AND status = 'open'
      AND booked + 2 <= capacity
    ORDER BY slot_time LIMIT 1`,
  [activity.id, date]
);

// İKİ kişilik yer aranıyor, "bir yeri var" yetmiyor: test 2 kişilik bir
// kayıt açıyor ve 4/5 dolu bir slot seçilseydi kapasite kapısı haklı olarak
// reddederdi — süit de bunu kendi hatası sanardı.
if (!slot) {
  console.log('KALDI  yarın için 2 kişilik açık slot bulunamadı — seed çalıştırıldı mı?');
  process.exit(1);
}

const before = slot.booked;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

// ---------- 1. Yönetici elle kayıt açıyor ----------

const context = await browser.newContext({ viewport: { width: 1100, height: 1200 } });
const page = await context.newPage();
await loginAs(page, BASE, OPERATOR, 'manager');
await page.goto(`${BASE}/isletme/bugun`, { waitUntil: 'networkidle' });

check('yöneticiye manuel kayıt formu gösteriliyor', (await page.locator('text=Elle rezervasyon ekle').count()) === 1);

await page.selectOption('#activityId', activity.id);
await page.fill('#date', date);
await page.getByRole('button', { name: 'Saatleri Yükle' }).click();
await page.waitForTimeout(1500);

const options = await page.locator('#slotId option').allInnerTexts();
check('seçilen gün için saatler geliyor', options.some((o) => /\d{2}:\d{2}/.test(o)), options[0] ?? '');

await page.selectOption('#slotId', slot.id);
await page.fill('#people', '2');
await page.fill('#name', 'Telefondan Müşteri');
await page.fill('#phone', '0533 111 22 33');
await page.selectOption('#source', 'phone');
await page.getByRole('button', { name: 'Rezervasyonu Ekle' }).click();
await page.waitForTimeout(2500);

const body = await page.locator('body').innerText();
check('kullanıcıya bilet kodu gösteriliyor', /Bilet kodu/.test(body), body.match(/Bilet kodu:.{0,30}/)?.[0] ?? '');

// ---------- 2. Kapasite gerçekten düştü ----------

const after = await client.get('SELECT booked FROM slots WHERE id = ?', [slot.id]);
check(
  'manuel kayıt slot kapasitesini düşürüyor',
  after.booked === before + 2,
  `${before} -> ${after.booked}`
);

// ---------- 3. Kayıt doğru işaretlendi ----------

const booking = await client.get(
  `SELECT * FROM bookings WHERE slot_id = ? ORDER BY created_at DESC LIMIT 1`,
  [slot.id]
);

check('kaynak telefon olarak saklandı', booking.source === 'phone', booking.source);
check('ödeme biçimi tesiste', booking.payment_mode === 'onsite', booking.payment_mode);
check('kaydı açan personel saklandı', Boolean(booking.created_by), booking.created_by ?? 'yok');
check('rezervasyon doğrudan geçerli bilete dönüştü', booking.status === 'confirmed', booking.status);

const payment = await client.get('SELECT id FROM payments WHERE booking_id = ?', [booking.id]);
check('manuel kayıt ödeme kaydı ÜRETMİYOR — komisyon doğmuyor', !payment);

// ---------- 4. Müşteri tarafındaki müsaitlik de düştü ----------
//
// Asıl iddia bu: işletmenin defterine yazdığı rezervasyon RASTLA'da da
// görünüyor ve aynı saate ikinci bir grup alınmıyor.

const publicPage = await (await browser.newContext()).newPage();
await publicPage.goto(`${BASE}/rezervasyon/${activity.slug}`, { waitUntil: 'networkidle' });
await publicPage.waitForTimeout(800);

const remaining = await client.get(
  'SELECT capacity - booked AS remaining FROM slots WHERE id = ?',
  [slot.id]
);
check(
  'müşteri tarafındaki kalan yer de düştü',
  remaining.remaining === slot.capacity - before - 2,
  `kalan: ${remaining.remaining}/${slot.capacity}`
);

await context.close();

// ---------- 5. Saha personeline gösterilmiyor ----------

const staffContext = await browser.newContext({ viewport: { width: 1100, height: 1200 } });
const staffPage = await staffContext.newPage();
await loginAs(staffPage, BASE, OPERATOR, 'staff');
await staffPage.goto(`${BASE}/isletme/bugun`, { waitUntil: 'networkidle' });

check(
  'saha personeline manuel kayıt formu GÖSTERİLMİYOR',
  (await staffPage.locator('text=Elle rezervasyon ekle').count()) === 0
);
check(
  'saha personeli yine de günü görebiliyor',
  (await staffPage.locator('text=Günün akışı').count()) === 1
);

await staffContext.close();
await browser.close();
await client.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
