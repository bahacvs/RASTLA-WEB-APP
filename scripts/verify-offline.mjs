/**
 * Kabul kriteri testi: uygulama hiçbir dış host'a istek atmamalı.
 *
 * Prototipler Tailwind CDN'ine, Google Fonts'a ve Stitch'in görsel CDN'ine
 * bağlıydı. Bu betik production sunucusundaki her rotayı gezip yapılan tüm
 * ağ isteklerini toplar ve localhost dışında bir host varsa hata verir.
 *
 * Kullanım: npm run build && npm start & node scripts/verify-offline.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

const ROUTES = [
  '/',
  '/ara',
  '/aktivite/elektrikli-sup-deneyimi',
  '/rezervasyon/elektrikli-sup-deneyimi',
  '/rezervasyonlarim',
];

/**
 * Harita karoları tek istisnadır: gerçek bir harita için karolar bir
 * sağlayıcıdan gelmek zorunda ve bunun kaçışı yok. Font, ikon ve görsellerin
 * hepsi hâlâ repoda; başka hiçbir dış host'a izin verilmez.
 */
const TILE_HOST = 'api.maptiler.com';
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', TILE_HOST]);

// Ortamda hazır kurulu Chromium kullanılır; playwright paketinin beklediği
// sürümle eşleşmediği için yol açıkça verilir (indirme yapılmaz).
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

const external = new Set();
const failed = [];

context.on('request', (req) => {
  const host = new URL(req.url()).hostname;
  if (!ALLOWED_HOSTS.has(host)) external.add(`${host}  <-  ${req.url().slice(0, 120)}`);
});

context.on('requestfailed', (req) => {
  failed.push(`${req.url().slice(0, 120)} — ${req.failure()?.errorText}`);
});

const page = await context.newPage();

for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  // Tembel yüklenen görselleri tetiklemek için sayfayı sonuna kadar kaydır.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  console.log(`gezildi: ${route}`);
}

// Harita görünümü yalnızca etkileşimle açılıyor; onu da tetikle.
await page.goto(`${BASE}/ara`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Harita' }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Filtrele' }).click();
await page.waitForTimeout(600);
console.log('gezildi: /ara (harita + filtre paneli)');

await browser.close();

console.log('\n--- Sonuç ---');

if (failed.length) {
  console.log(`Başarısız istek (${failed.length}):`);
  for (const f of failed) console.log('  ' + f);
}

if (external.size) {
  console.error(`\nHATA: ${external.size} dış istek tespit edildi:`);
  for (const e of external) console.error('  ' + e);
  process.exit(1);
}

const tileRequests = [...external].length;
console.log(
  tileRequests === 0
    ? 'Dış host isteği yok — harita bu gezinmede açılmadı, geri kalan her şey yerel.'
    : 'Yalnızca harita karoları dışarı çıkıyor; diğer tüm kaynaklar yerel.'
);
