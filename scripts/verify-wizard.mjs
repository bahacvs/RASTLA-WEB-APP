/**
 * Aktivite oluşturma sihirbazının testi.
 *
 * Sihirbazın varlık sebebi kolaylık değil, **sıranın görünür olması**: bugün
 * bir ilanın yayına girmesi için üç ayrı ekrandan geçmek gerekiyor ve o sıra
 * hiçbir yerde yazmıyordu; işletme "Yayına Al" düğmesini kapalı buluyor,
 * sebebini göremiyordu.
 *
 * Sınananlar:
 *   1. Sihirbaz uçtan uca yayınlanabilir bir aktivite üretiyor.
 *   2. Eksik adım varken yayın REDDEDİLİYOR ve eksikler İSİMLE söyleniyor —
 *      arayüzde düğmeyi gizlemek değil, sunucu eylemi reddediyor.
 *   3. Geri dönüp düzeltmek İKİNCİ bir taslak açmıyor.
 *   4. **Önizlemedeki seans sayısı, üretilen slot sayısına eşit** — hazırlık
 *      payı tanımlıyken de.
 *   5. **Hazırlık payı tanımlı bir aktivitede `syncSlots` üretilen slotları
 *      kapatmıyor.** Bu, bulunup düzeltilen gerçek bir hatanın nöbetçisi:
 *      üretim hazırlık payını katıyor, eşitleme katmıyordu ve 15 dk aralık +
 *      5 dk hazırlıkta üretilen 6 slotun 4'ü anında kapanıyordu. İşletme
 *      hazırlık payını girdiği anda müsaitliğinin çoğunu kaybediyordu.
 *
 * 4 ve 5 sunucuya ihtiyaç duymuyor ve ayrı bir süreçte, izole bir
 * veritabanında koşuyor; 1-3 tarayıcıdan yürüyor.
 *
 * Kullanım: npm start & node scripts/verify-wizard.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ensureTestAccounts, loginAs } from './lib/test-accounts.mjs';

const execFileAsync = promisify(execFile);

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const OPERATOR = 'buyukcekmece-wsc';

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

// ============================================================
// BÖLÜM A — Saat hesabı ve eşitleme (AYRI SÜREÇ, izole veritabanı)
// ============================================================
//
// Ayrı süreçte çalışıyor çünkü `lib/db/index.mjs` bağlantıyı tekil olarak
// önbelleğe alıyor: burada geçici bir veritabanı açıp kapatsaydık, aynı
// süreçteki Bölüm B kapanmış bağlantıyı devralırdı. `node -e` proje
// dizininden çağrılıyor ki better-sqlite3 çözülebilsin.

const dir = mkdtempSync(join(tmpdir(), 'rastla-wizard-'));

const worker = `
process.env.DATABASE_PATH = process.argv[1];
delete process.env.DATABASE_URL;

const { db } = await import('./lib/db/index.mjs');
const slots = await import('./lib/db/slots.ts');
const { timesForRule } = await import('./lib/schedule-times.mjs');

const client = await db();
const now = new Date().toISOString();
await client.run("INSERT INTO operators (id,name,created_at) VALUES ('op','Test',?)", [now]);
await client.run(
  \`INSERT INTO activities (id,operator_id,slug,title,category,price_try,duration_minutes,
      location_name,capacity_mode,prep_minutes,created_at)
    VALUES ('act','op','t','Test','jet-ski',100,15,'Sahil','per_person',5,?)\`, [now]);

const d = new Date();
const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');

const rule = { activityId:'act', weekdays:127, startTime:'08:00', endTime:'10:00',
  intervalMinutes:15, capacity:4, validFrom:iso, validUntil:null };

const previewPrep = timesForRule(rule, 5).length;
const previewNone = timesForRule(rule, 0).length;

const created = await slots.createRule(rule);
await slots.generateSlots(created);
const generated = await slots.listSlots('act', iso);

const sync = await slots.syncSlots('act');
const after = await slots.listSlots('act', iso);

console.log('RASTLA_SONUC:' + JSON.stringify({
  previewPrep, previewNone,
  generated: generated.length,
  times: generated.map(s => s.time).join(' '),
  closed: sync.closed,
  openAfter: after.filter(s => s.status === 'open').length,
}));
await client.close();
`;

const { stdout } = await execFileAsync(
  process.execPath,
  ['--experimental-strip-types', '-e', worker, join(dir, 'test.db')],
  { encoding: 'utf8', cwd: process.cwd() }
);

const a = JSON.parse(stdout.split('RASTLA_SONUC:')[1].trim());
rmSync(dir, { recursive: true, force: true });

check(
  'önizleme hazırlık payını hesaba katıyor',
  a.previewPrep === 6,
  `15 dk aralık + 5 dk hazırlık, 08:00–10:00 → ${a.previewPrep} seans (20 dakikada bir)`
);
check(
  'hazırlık payı olmadan farklı bir sayı çıkıyor (önizleme gerçekten prep okuyor)',
  a.previewNone === 8,
  `prep=0 → ${a.previewNone}`
);
check(
  'ÜRETİLEN slot sayısı önizlemeyle birebir aynı',
  a.generated === a.previewPrep,
  `önizleme ${a.previewPrep}, üretilen ${a.generated}`
);
check(
  'üretilen saatler hazırlık payına göre kaymış',
  a.times === '08:00 08:20 08:40 09:00 09:20 09:40',
  a.times
);
check('eşitleme, hazırlık paylı slotları KAPATMIYOR', a.closed === 0, `kapatılan: ${a.closed}`);
check(
  'eşitleme sonrası bütün slotlar açık kalıyor',
  a.openAfter === a.generated,
  `${a.openAfter}/${a.generated} açık`
);

// ============================================================
// BÖLÜM B — Sihirbaz uçtan uca (tarayıcı)
// ============================================================

await ensureTestAccounts();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const context = await browser.newContext({ viewport: { width: 1200, height: 1400 } });
const page = await context.newPage();

await loginAs(page, BASE, OPERATOR, 'owner');
await page.goto(`${BASE}/isletme/aktiviteler/sihirbaz`, { waitUntil: 'networkidle' });

const TITLE = `Sihirbaz Testi ${Date.now().toString().slice(-6)}`;

// ---------- 1. adım: temel ----------
await page.fill('#title', TITLE);
await page.selectOption('#category', 'sup');
await page.fill('#durationMinutes', '45');
await page.fill('#priceTRY', '650');
await page.getByRole('button', { name: 'Devam et' }).click();
await page.waitForURL(/adim=konum/, { timeout: 15000 }).catch(() => {});

const afterBasics = new URL(page.url());
const activityId = afterBasics.searchParams.get('aktivite');
check('1. adım taslağı oluşturup kimliği adrese koyuyor', Boolean(activityId), activityId ?? 'yok');

// ---------- Yayın erken denenirse reddedilmeli ----------
await page.goto(`${BASE}/isletme/aktiviteler/sihirbaz?aktivite=${activityId}&adim=ozet`, {
  waitUntil: 'networkidle',
});
const earlyText = await page.locator('body').innerText();
check(
  'eksikler İSİMLE söyleniyor',
  /Konum girilmedi/.test(earlyText) &&
    /Takvim kuralı tanımlanmadı/.test(earlyText) &&
    /görsel yüklenmedi/i.test(earlyText),
  earlyText.match(/Şunlar eksik:[\s\S]{0,140}/)?.[0]?.replace(/\n+/g, ' ') ?? 'liste yok'
);

// ---------- 2. adım: konum ----------
await page.goto(`${BASE}/isletme/aktiviteler/sihirbaz?aktivite=${activityId}&adim=konum`, {
  waitUntil: 'networkidle',
});
await page.fill('#location', 'Test Sahili');
await page.fill('#lat', '41.0155');
await page.fill('#lng', '28.5862');
await page.getByRole('button', { name: 'Devam et' }).click();
await page.waitForURL(/adim=takvim/, { timeout: 15000 }).catch(() => {});
check('2. adım takvime geçiyor', /adim=takvim/.test(page.url()), page.url());

// ---------- 3. adım: takvim (hazırlık paylı) ----------
await page.fill('#startTime', '09:00');
await page.fill('#endTime', '12:00');
await page.fill('#intervalMinutes', '30');
await page.fill('#capacity', '6');
await page.fill('#prepMinutes', '15');
await page.waitForTimeout(300);

const previewText = await page.locator('body').innerText();
const previewCount = Number(previewText.match(/günde\s+(\d+)\s+seans/)?.[1] ?? 0);
check(
  'arayüz hazırlık payını önizlemeye yansıtıyor',
  previewCount === 4,
  `09:00–12:00, 30+15 dk → ${previewCount} seans`
);

await page.getByRole('button', { name: 'Takvimi Oluştur' }).click();
await page.waitForURL(/adim=gorseller/, { timeout: 20000 }).catch(() => {});
check('3. adım görsellere geçiyor', /adim=gorseller/.test(page.url()), page.url());

// Üretilen slotlar önizlemeyle aynı mı — takvim ekranından okunuyor.
{
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
  const cal = await context.newPage();
  await cal.goto(`${BASE}/isletme/aktiviteler/${activityId}/takvim?gun=${iso}`, {
    waitUntil: 'networkidle',
  });
  const calText = await cal.locator('body').innerText();
  // Nokta işaretiyle başlayan desen KURAL LİSTESİNİ hedefliyor
  // ("Her gün · günde 4 slot"). Gevşek desen, sayfanın üstündeki yeni-kural
  // formunun kendi önizlemesini ("Bu kural günde 20 slot üretir") yakalıyordu —
  // o da doğruydu ama başka bir kuralın sayısıydı.
  const stated = Number(calText.match(/·\s*günde\s+(\d+)\s+slot/)?.[1] ?? 0);
  check(
    'takvim ekranı da aynı sayıyı söylüyor',
    stated === previewCount,
    `sihirbaz ${previewCount}, takvim ${stated}`
  );
  await cal.close();
}

// ---------- Geri dönüp düzeltmek ikinci taslak açmıyor ----------
await page.goto(`${BASE}/isletme/aktiviteler/sihirbaz?aktivite=${activityId}&adim=temel`, {
  waitUntil: 'networkidle',
});
await page.fill('#title', `${TITLE} (düzeltildi)`);
await page.getByRole('button', { name: 'Devam et' }).click();
await page.waitForTimeout(2000);

{
  const list = await context.newPage();
  await list.goto(`${BASE}/isletme/aktiviteler`, { waitUntil: 'networkidle' });
  const listText = await list.locator('body').innerText();
  const originals = listText.split(TITLE).length - 1;
  check(
    'geri dönüp düzeltmek İKİNCİ taslak açmıyor',
    originals === 1,
    `listede ${originals} kayıt`
  );
  check('düzeltme kaydedildi', /düzeltildi/.test(listText));
  await list.close();
}

// ---------- Görselsiz yayın reddediliyor (sunucu tarafı) ----------
await page.goto(`${BASE}/isletme/aktiviteler/sihirbaz?aktivite=${activityId}&adim=ozet`, {
  waitUntil: 'networkidle',
});
const before = await page.locator('body').innerText();
check(
  'takvim tamamken yalnızca görsel eksik görünüyor',
  /görsel yüklenmedi/i.test(before) && !/Takvim kuralı tanımlanmadı/.test(before),
  before.match(/Şunlar eksik:[\s\S]{0,90}/)?.[0]?.replace(/\n+/g, ' ') ?? ''
);

// Arayüz düğmeyi kapatıyor mu?
const publishButton = page.getByRole('button', { name: /Önce eksikleri tamamlayın|Yayına Al/ });
check(
  'eksik varken yayın düğmesi KAPALI',
  await publishButton.isDisabled(),
  await publishButton.innerText()
);

// Asıl kontrol: arayüzün engelini SÖKÜP göndermek. Düğmeyi kapatmak
// doğrulama değildir; kararı sunucu eyleminin vermesi gerekiyor.
// (Aynı desen verify-uploads.mjs içinde de kullanılıyor.)
await publishButton.evaluate((el) => el.removeAttribute('disabled'));
await publishButton.click();
await page.waitForTimeout(2500);

const serverSaid = await page.locator('body').innerText();
check(
  'sunucu eylemi eksikleri gerekçe göstererek REDDEDİYOR',
  /görsel yüklenmedi/i.test(serverSaid),
  serverSaid.match(/[^\n]*görsel yüklenmedi[^\n]*/i)?.[0] ?? 'gerekçe yok'
);

{
  const list = await context.newPage();
  await list.goto(`${BASE}/isletme/aktiviteler`, { waitUntil: 'networkidle' });
  const row = list.locator('li').filter({ hasText: TITLE }).first();
  const rowText = await row.innerText();
  check(
    'eksik varken ilan YAYINA ÇIKMIYOR',
    /Taslak/.test(rowText),
    rowText.split('\n').slice(0, 3).join(' · ')
  );
  await list.close();
}

await context.close();
await browser.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
