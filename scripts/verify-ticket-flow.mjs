/**
 * Uçtan uca bilet akışı testi — gerçek sunucu üzerinden.
 *
 * Kapsanan senaryo:
 *   müşteri rezervasyon yapar -> QR'lı bilet üretilir -> bilet müşterinin
 *   listesinde görünür -> işletme giriş yapar -> bileti onaylar -> AYNI bileti
 *   ikinci kez onaylamaya çalışır ve reddedilir.
 *
 * Ayrıca yetkilendirme sınanır: bir işletme başka bir işletmenin biletini
 * onaylayamamalı.
 *
 * Kullanım: npm start & node scripts/verify-ticket-flow.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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


// ---------- Müşteri: rezervasyon oluştur ----------
// elektrikli-sup-deneyimi -> buyukcekmece-wsc işletmesine ait
const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
const cp = await customer.newPage();

await cp.goto(`${BASE}/rezervasyon/elektrikli-sup-deneyimi`, { waitUntil: 'networkidle' });
await cp.waitForTimeout(400);
check('müsait slot bulundu', await pickAvailableSlot(cp));
await cp.getByLabel('Ad Soyad').fill('Deniz Yılmaz');
await cp.getByLabel('Telefon').fill('0532 111 22 33');
await cp.getByRole('button', { name: 'Rezervasyonu Tamamla' }).first().click();

await cp.waitForURL(/\/bilet\//, { timeout: 15000 });
const code = decodeURIComponent(new URL(cp.url()).pathname.split('/').pop());
check('rezervasyon oluşturuldu ve bilete yönlendirildi', /^[0-9A-Z-]{20,}$/.test(code), code);

check('bilet geçerli görünüyor', await cp.getByText('Geçerli bilet').isVisible());
check('QR kodu çiziliyor', (await cp.locator('[aria-label="Bilet QR kodu"] svg').count()) === 1);

// QR'ın gerçekten okunabildiğini jsQR ile doğrula.
// Bu, iOS Safari'deki okuma yolunun ta kendisi: BarcodeDetector olmayan
// cihazlarda işletme kamerayı bu çözücüyle kullanıyor.
const jsQrSource = readFileSync(join(process.cwd(), 'node_modules', 'jsqr', 'dist', 'jsQR.js'), 'utf8');
const decoded = await cp.evaluate(async (source) => {
  // UMD paketini sayfa bağlamında değerlendirip çözücüyü elde et.
  const box = { exports: {} };
  new Function('module', 'exports', source)(box, box.exports);
  const jsQR = box.exports.default ?? box.exports;

  const svg = document.querySelector('[aria-label="Bilet QR kodu"] svg');
  if (!svg) return null;

  // SVG'yi tuvale çizip piksel verisini çözücüye ver.
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.width = 400;
  img.height = 400;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 400, 400);
  ctx.drawImage(img, 0, 0, 400, 400);
  URL.revokeObjectURL(url);

  const data = ctx.getImageData(0, 0, 400, 400);
  return jsQR(data.data, data.width, data.height)?.data ?? null;
}, jsQrSource);

check(
  'QR jsQR ile çözülebiliyor (iOS okuma yolu)',
  typeof decoded === 'string' && decoded.includes(code),
  decoded ?? 'çözülemedi'
);

// ---------- Müşteri: kendi rezervasyonlarını görüyor ----------
await cp.goto(`${BASE}/rezervasyonlarim`, { waitUntil: 'networkidle' });
check('rezervasyon kendi listesinde görünüyor', await cp.getByText(code).isVisible());

// Oturumu olmayan başka bir ziyaretçi bu rezervasyonu görmemeli.
const stranger = await browser.newContext();
const sp = await stranger.newPage();
await sp.goto(`${BASE}/rezervasyonlarim`, { waitUntil: 'networkidle' });
check(
  'başka ziyaretçi bu rezervasyonu görmüyor',
  await sp.getByText('Henüz rezervasyonun yok').isVisible()
);
await stranger.close();

// ---------- Yanlış işletme onaylayamamalı ----------
const wrong = await browser.newContext({ viewport: { width: 390, height: 844 } });
const wp = await wrong.newPage();
await wp.goto(`${BASE}/isletme`, { waitUntil: 'networkidle' });
await wp.selectOption('#operatorId', 'mimarsinan-marina');
await wp.fill('#code', '5678');
await wp.getByRole('button', { name: 'Giriş Yap' }).click();
await wp.waitForURL(/\/isletme\/tara/, { timeout: 15000 });

await wp.fill('#code', code);
await wp.getByRole('button', { name: 'Onayla' }).click();
await wp.waitForTimeout(1200);
check(
  'yanlış işletme onaylayamıyor',
  await wp.getByText('başka bir işletmeye ait').isVisible()
);
await wrong.close();

// ---------- Doğru işletme: ilk onay ----------
const operator = await browser.newContext({ viewport: { width: 390, height: 844 } });
const op = await operator.newPage();
await op.goto(`${BASE}/isletme`, { waitUntil: 'networkidle' });
await op.selectOption('#operatorId', 'buyukcekmece-wsc');
await op.fill('#code', '1234');
await op.getByRole('button', { name: 'Giriş Yap' }).click();
await op.waitForURL(/\/isletme\/tara/, { timeout: 15000 });

// Hatalı kod reddedilmeli.
await op.fill('#code', 'YOKB-OYLE-BIRK-ODXX');
await op.getByRole('button', { name: 'Onayla' }).click();
await op.waitForTimeout(1000);
check('geçersiz kod reddediliyor', await op.getByText('Bilet bulunamadı').isVisible());

await op.fill('#code', code);
await op.getByRole('button', { name: 'Onayla' }).click();
await op.waitForTimeout(1200);
check('ilk onay başarılı', await op.getByText('Onaylandı', { exact: true }).isVisible());
check('misafir adı gösteriliyor', await op.getByText('Deniz Yılmaz').isVisible());

// ---------- İKİNCİ onay reddedilmeli ----------
await op.fill('#code', code);
await op.getByRole('button', { name: 'Onayla' }).click();
await op.waitForTimeout(1200);
check(
  'aynı bilet ikinci kez onaylanamıyor',
  await op.getByText('daha önce kullanılmış').isVisible()
);
check('ilk kullanım zamanı gösteriliyor', await op.getByText('İlk kullanım').isVisible());

// QR'ın taşıdığı URL biçimiyle okutmak da aynı sonucu vermeli.
await op.fill('#code', `${BASE}/bilet/${code}`);
await op.getByRole('button', { name: 'Onayla' }).click();
await op.waitForTimeout(1200);
check(
  'QR URL biçimi de aynı korumaya tabi',
  await op.getByText('daha önce kullanılmış').isVisible()
);
await operator.close();

// ---------- Müşteri tarafında durum güncellendi ----------
await cp.goto(`${BASE}/bilet/${code}`, { waitUntil: 'networkidle' });
check('bilet artık kullanıldı görünüyor', await cp.getByText('Kullanıldı').first().isVisible());
check('kullanılmış bilette QR gösterilmiyor', (await cp.locator('[aria-label="Bilet QR kodu"]').count()) === 0);

await customer.close();
await browser.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
