/**
 * Çevrimdışı bilet testi.
 *
 * Asıl senaryo: müşteri sahilde, kapsama alanı zayıf ve QR'ını göstermesi
 * gerekiyor. Daha önce açılmış bir bilet, bağlantı tamamen kesildiğinde de
 * açılabilmeli.
 *
 * Ayrıca işletme ekranlarının çevrimdışı ÇALIŞMAMASI gerektiği doğrulanır:
 * bilet onayı sunucudaki koşullu güncellemeye dayanır, çevrimdışı onay aynı
 * biletin iki kez geçmesi demek olurdu.
 *
 * Kullanım: npm start & node scripts/verify-offline-ticket.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

/** Yeterli yeri olan ilk slotu seçer. Varsayılan seçime güvenmek kırılgandır:
 *  önceki koşumlar o slotu doldurmuş olabilir. */
async function pickAvailableSlot(page) {
  const slot = page.locator('button[aria-pressed]:not([disabled])').filter({ hasText: 'yer' }).first();
  if ((await slot.count()) === 0) return false;
  await slot.click();
  return true;
}


const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

// --- Rezervasyon oluştur ---
await page.goto(`${BASE}/rezervasyon/elektrikli-sup-deneyimi`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
check('müsait slot bulundu', await pickAvailableSlot(page));
await page.getByLabel('Ad Soyad').fill('Çevrimdışı Test');
await page.getByLabel('Telefon').fill('0532 999 88 77');
await page.getByRole('button', { name: 'Rezervasyonu Tamamla' }).first().click();
await page.waitForURL(/\/bilet\//, { timeout: 15000 });

const code = decodeURIComponent(new URL(page.url()).pathname.split('/').pop());
check('bilet oluşturuldu', Boolean(code), code);

// --- Service worker kaydoldu mu ---
const registered = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  return Boolean(reg?.active);
});
check('service worker etkin', registered);

if (!registered) {
  console.log('\nService worker kaydolmadı — üretim derlemesi ile çalıştırıldığından emin olun.');
} else {
  // Biletin önbelleğe girmesi için bir kez daha ziyaret et.
  await page.goto(`${BASE}/bilet/${code}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // --- Bağlantıyı tamamen kes ---
  await context.setOffline(true);

  await page.goto(`${BASE}/bilet/${code}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(600);

  const ticketVisible = await page.getByText(code).first().isVisible().catch(() => false);
  check('çevrimdışı bilet açılıyor', ticketVisible);

  const qrVisible =
    (await page.locator('[aria-label="Bilet QR kodu"] svg').count().catch(() => 0)) === 1;
  check('çevrimdışı QR görünüyor', qrVisible);

  // --- İşletme ekranı çevrimdışı çalışmamalı ---
  await page.goto(`${BASE}/isletme/tara`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(600);
  const scanPanel = await page
    .getByRole('heading', { name: 'Bilet Okut' })
    .isVisible()
    .catch(() => false);
  check('işletme onay ekranı çevrimdışı açılmıyor', !scanPanel);

  await context.setOffline(false);
}

await browser.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
