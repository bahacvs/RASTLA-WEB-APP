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
import { book } from './lib/booking.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

// --- Rezervasyon oluştur (numara doğrulaması dahil) ---
const created = await book(page, {
  baseUrl: BASE,
  slug: 'elektrikli-sup-deneyimi',
  name: 'Çevrimdışı Test',
  phone: '0532 999 88 77',
});
check('müsait slot bulundu ve rezervasyon yapıldı', Boolean(created.code), created.error);
const code = created.code;
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
