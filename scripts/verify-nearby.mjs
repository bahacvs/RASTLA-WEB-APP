/**
 * "Yakınımdakiler" özelliğinin testi.
 *
 * Bu özellikte asıl iddia sıralama değil **mahremiyet**: kullanıcının
 * koordinatı tarayıcıdan hiç çıkmıyor. Mesafe istemcide hesaplanıyor, çünkü
 * aktivitelerin tamamı zaten istemcide. Sunucuya gönderilseydi saklama süresi,
 * aydınlatma metni, ihlal senaryosu ve silme talebi — dördü birden gündeme
 * gelirdi. Bu yüzden testin merkezinde o iddia var.
 *
 * Sınananlar:
 *   1. İzin verilince sonuçlar yakından uzağa sıralanıyor ve mesafe yazılıyor.
 *   2. Sıralama BAĞIMSIZ hesaplanan mesafeyle birebir uyuşuyor. Uygulamanın
 *      kendi fonksiyonu çağrılmıyor; haversine burada yeniden yazıldı ki
 *      hatalı bir formül kendi kendini doğrulamasın.
 *   3. Konum HİÇBİR isteğe girmiyor — adres, sorgu dizesi ya da gövde.
 *   4. İzin reddedilince liste çalışmaya devam ediyor, sonuç sayısı düşmüyor;
 *      reddetmek özelliği kaybettirir, aramayı değil.
 *   5. Koordinat kalıcı depoya (localStorage/sessionStorage/çerez) yazılmıyor;
 *      sekme kapanınca iz kalmıyor.
 *
 * Kullanım: npm start & node scripts/verify-nearby.mjs
 */
import { chromium } from 'playwright';
import { db } from '../lib/db/index.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

// Büyükçekmece sahili — demo aktivitelerin ortasına yakın bir nokta.
const ME = { lat: 40.985, lng: 28.59 };

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

/** Bağımsız haversine — uygulamanınkinden ayrı, kasıtlı olarak. */
function haversineKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

// ---------- 1. İzin verilmiş hâl ----------

const granted = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ['geolocation'],
  geolocation: { latitude: ME.lat, longitude: ME.lng },
});

// Konumun ağa çıkıp çıkmadığını izlemek için HER isteği topluyoruz.
const traffic = [];
granted.on('request', (r) => traffic.push(`${r.url()} ${r.postData() ?? ''}`));

const page = await granted.newPage();
await page.goto(`${BASE}/ara`, { waitUntil: 'networkidle' });

const before = await page.locator('article').count();
await page.getByRole('button', { name: 'Yakınımdakiler' }).click();
await page.waitForTimeout(1500);

const after = await page.locator('article').count();
check('konum verilince sonuç sayısı değişmiyor', before === after, `${before} -> ${after}`);

const badges = await page
  .locator('article')
  .evaluateAll((cards) =>
    cards.map((c) => {
      const el = [...c.querySelectorAll('span')].find((s) => /\d\s*(m|km)$/.test(s.textContent ?? ''));
      return el ? el.textContent.trim() : null;
    })
  );

// Koordinatı olan her kartta rozet olmalı. Koordinatı OLMAYAN ilanlar
// rozetsiz kalır ve listenin SONUNA düşer — elenmezler. İşletme konum
// girmediyse bu ilanın suçu değil; aramadan tamamen düşmesi kullanıcıyı da
// işletmeyi de cezalandırırdı.
const withBadge = badges.filter(Boolean).length;
const firstMissing = badges.indexOf(null);

check(
  'koordinatı olan kartlarda mesafe yazılı',
  withBadge > 0,
  `${withBadge}/${badges.length} kart`
);
check(
  'koordinatsız ilanlar eleniyor değil, SONA atılıyor',
  firstMissing === -1 || badges.slice(firstMissing).every((b) => b === null),
  firstMissing === -1 ? 'hepsinin koordinatı var' : `ilk rozetsiz kart: ${firstMissing + 1}.`
);

// Rozetlerdeki mesafeler artan sırada olmalı.
const asKm = badges.filter(Boolean).map((b) => {
  const n = Number(b.replace(/\s*(m|km)$/, '').replace(',', '.'));
  return b.endsWith('km') ? n : n / 1000;
});
const sorted = [...asKm].every((v, i, arr) => i === 0 || arr[i - 1] <= v + 0.06);
check('mesafeler artan sırada', sorted, asKm.map((k) => k.toFixed(2)).join(' '));

// ---------- 2. Sıralama bağımsız hesapla doğrulanıyor ----------
//
// Artan sıra tek başına yeterli değil: uygulama yanlış bir formül kullanıp
// yine de artan sırada listeleyebilir. Bu yüzden en yakın ilan veritabanından
// ve BURADA yeniden yazılmış haversine ile ayrıca bulunuyor. Uygulamanın
// kendi fonksiyonu çağrılmıyor ki hatalı formül kendi kendini doğrulamasın.

const client = await db();
const rows = await client.all(
  `SELECT title, lat, lng FROM activities WHERE status = 'published' AND lat IS NOT NULL`
);
const nearest = rows
  .map((r) => ({ title: r.title, km: haversineKm(ME, { lat: r.lat, lng: r.lng }) }))
  .sort((a, b) => a.km - b.km)[0];

const firstCard = (await page.locator('article h3').first().innerText()).trim();
check(
  'en üstteki ilan gerçekten en yakın olan',
  nearest !== undefined && firstCard === nearest.title,
  `arayüz: ${firstCard} | bağımsız hesap: ${nearest?.title} (${nearest?.km.toFixed(2)} km)`
);

// ---------- 3. Konum ağa ÇIKMIYOR ----------
//
// Asıl iddia bu. Koordinatın kendisini ve makul kısaltmalarını arıyoruz.
const needles = [
  String(ME.lat),
  String(ME.lng),
  ME.lat.toFixed(4),
  ME.lng.toFixed(4),
  ME.lat.toFixed(3),
  ME.lng.toFixed(3),
];
const leaked = traffic.filter((t) => needles.some((n) => t.includes(n)));
check(
  'koordinat HİÇBİR isteğe girmiyor',
  leaked.length === 0,
  leaked.length ? leaked[0].slice(0, 120) : `${traffic.length} istek tarandı`
);

// ---------- 4. Kalıcı depoya yazılmıyor ----------

const stored = await page.evaluate(() => ({
  local: JSON.stringify(localStorage),
  session: JSON.stringify(sessionStorage),
  cookie: document.cookie,
}));
const persisted = [stored.local, stored.session, stored.cookie].join(' ');
check(
  'koordinat localStorage/sessionStorage/çerezde yok',
  !needles.some((n) => persisted.includes(n)),
  persisted.slice(0, 80) || '(hepsi boş)'
);

await granted.close();

// ---------- 5. İzin reddedilmiş hâl ----------

const denied = await browser.newContext({ viewport: { width: 390, height: 844 } });
// İzin verilmiyor: Playwright'ta izin listesi boşsa istek reddediliyor.
await denied.grantPermissions([]);
const page2 = await denied.newPage();
await page2.goto(`${BASE}/ara`, { waitUntil: 'networkidle' });

const beforeDenied = await page2.locator('article').count();
await page2.getByRole('button', { name: 'Yakınımdakiler' }).click();
await page2.waitForTimeout(2500);
const afterDenied = await page2.locator('article').count();

check(
  'izin reddedilince sonuçlar kaybolmuyor',
  beforeDenied === afterDenied && afterDenied > 0,
  `${beforeDenied} -> ${afterDenied}`
);

const body = await page2.locator('body').innerText();
check(
  'kullanıcıya ne olduğu söyleniyor',
  /Konum izni verilmedi|Konum alınamadı/.test(body),
  body.match(/Konum[^.\n]*/)?.[0]?.slice(0, 60) ?? 'mesaj yok'
);

await denied.close();
await browser.close();
await client.close();

// ---------- Rapor ----------

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
