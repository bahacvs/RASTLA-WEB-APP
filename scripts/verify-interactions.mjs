/**
 * Prototipteki vanilla JS etkileşimlerinin React karşılıklarını sınar:
 * liste/harita geçişi, filtre paneli ve katılımcı sayacının toplamı güncellemesi.
 *
 * Kullanım: npm start & node scripts/verify-interactions.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

// --- Arama: liste / harita geçişi ---
await page.goto(`${BASE}/ara`, { waitUntil: 'networkidle' });

const listVisible = await page.getByRole('article').first().isVisible();
check('liste görünümü varsayılan', listVisible);

await page.getByRole('button', { name: 'Harita' }).click();
await page.waitForTimeout(600);

// Harita gerçek MapLibre; anahtar tanımlıysa tuval çizilir, tanımlı değilse
// yapılandırma uyarısı görünür. İkisi de geçerli — asıl kontrol listenin
// kapanıp harita alanının açılması.
const canvas = await page.locator('.maplibregl-canvas').count();
const notice = await page.getByText('Harita yapılandırılmamış').count();
const listGone = (await page.getByRole('article').count()) === 0;
check(
  'harita görünümü açılıyor',
  listGone && (canvas > 0 || notice > 0),
  canvas > 0 ? 'harita tuvali çizildi' : 'anahtar yok, uyarı gösterildi'
);

await page.getByRole('button', { name: 'Liste' }).click();
await page.waitForTimeout(300);
check('listeye geri dönülüyor', (await page.getByRole('article').count()) > 0);

// --- Arama: filtre paneli ---
const modal = page.getByRole('dialog', { name: 'Filtreler' });
const closedOffset = await modal.evaluate((el) => el.getBoundingClientRect().top);
await page.getByRole('button', { name: 'Filtrele' }).click();
await page.waitForTimeout(500);
const openHeading = await page.getByRole('heading', { name: 'Filtreler' }).isVisible();
check('filtre paneli açılıyor', openHeading && closedOffset >= 0);

await page.getByRole('button', { name: 'Uygula' }).click();
await page.waitForTimeout(500);
const inert = await modal.evaluate((el) => el.hasAttribute('inert'));
check('filtre paneli kapanıyor (inert)', inert);

// --- Rezervasyon: sayaç toplamı güncelliyor mu ---
await page.goto(`${BASE}/rezervasyon/elektrikli-sup-deneyimi`, { waitUntil: 'networkidle' });

// Özet bölümünün tamamını okur ("Toplam" birden fazla yerde geçiyor).
const summary = page.locator('section').filter({ hasText: 'Özet ve Toplam' });
const totalText = () => summary.innerText();
const before = await totalText();
check('başlangıç toplamı 2 x 600 TL', before.includes('1.200 TL'), before.replace(/\n/g, ' '));

await page.getByRole('button', { name: 'Yetişkin sayısını artır' }).click();
await page.waitForTimeout(200);
const after = await totalText();
check('yetişkin +1 -> 1.800 TL', after.includes('1.800 TL'), after.replace(/\n/g, ' '));

await page.getByRole('button', { name: 'Çocuk sayısını artır' }).click();
await page.waitForTimeout(200);
const withChild = await totalText();
check('çocuk +1 -> 2.400 TL', withChild.includes('2.400 TL'), withChild.replace(/\n/g, ' '));

// Yetişkin sayısı 1'in altına inememeli: 3 -> 2 -> 1, sonra buton kilitlenir.
const dec = page.getByRole('button', { name: 'Yetişkin sayısını azalt' });
await dec.click();
await dec.click();
await page.waitForTimeout(200);

const flooredTotal = await totalText();
check('yetişkin 1’e kadar iniyor', flooredTotal.includes('1 Yetişkin'), flooredTotal.replace(/\n/g, ' '));
check('minimumda azalt butonu kilitli', await dec.isDisabled());

await browser.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}

console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
