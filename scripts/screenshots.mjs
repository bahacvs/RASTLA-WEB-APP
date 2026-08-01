/**
 * Her rotanın mobil ve masaüstü ekran görüntüsünü alır.
 * Prototip önizlemeleriyle (reference/prototypes/*-preview.png) karşılaştırmak için.
 *
 * Kullanım: npm start & node scripts/screenshots.mjs [çıktı-dizini]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const OUT = process.argv[2] ?? 'screenshots';

const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/ara', name: 'search' },
  { path: '/aktivite/elektrikli-sup-deneyimi', name: 'activity-detail' },
  { path: '/rezervasyon/elektrikli-sup-deneyimi', name: 'booking' },
];

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  for (const route of ROUTES) {
    await page.goto(BASE + route.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const file = `${OUT}/${route.name}-${vp.name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }

  await context.close();
}

await browser.close();
