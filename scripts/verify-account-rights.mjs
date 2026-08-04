/**
 * Kişisel veri haklarının testi — KVKK md. 11.
 *
 * Metin yazmak hak tanımaz; talebin gerçekten karşılanabildiğini göstermek
 * gerekir. Sınananlar:
 *
 *   1. Dışa aktarma: kişi kendi verisinin tamamını indirebiliyor
 *      (hesap + rezervasyonlar + işlem günlüğü).
 *   2. Oturum yoksa dışa aktarma reddediliyor.
 *   3. Aktif rezervasyon varken silme, kullanıcı açıkça onaylamadıkça
 *      reddediliyor — işletme misafiri kapıda karşılayamaz hâle gelmesin.
 *   4. Silme sonrası ad ve telefon veritabanında ARTIK YOK.
 *   5. Anonimleştirme geri döndürülemez: telefon numarasından kayıt
 *      bulunamıyor.
 *   6. Rezervasyon kayıtları duruyor (10 yıllık zamanaşımı) ama kimseye
 *      işaret etmiyor.
 *   7. Silinen hesabın çerezi başka bir cihazda kalsa bile artık geçmiyor.
 *   8. Silinen numarayla yeniden rezervasyon yapmak YENİ bir hesap açıyor,
 *      eskisini diriltmiyor.
 *
 * Kullanım: npm start & node scripts/verify-account-rights.mjs
 */
import { chromium } from 'playwright';
import { db as connect, usingPostgres } from '../lib/db/index.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

// Uygulamayla aynı bağlantı: DATABASE_URL tanımlıysa silme iddiası Postgres'te
// de sınanır.
const store = await connect();

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

function query(sql, params = []) {
  return store.all(sql, params);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

/**
 * İsteği SAYFANIN İÇİNDEN atar.
 *
 * `page.request` kullanılamaz: oturum çerezi `Secure` işaretli ve Playwright'ın
 * istek bağlamı, tarayıcının localhost'a tanıdığı "güvenilir köken" istisnasını
 * uygulamadığı için çerezi http üzerinden göndermez. Sayfanın içinden atılan
 * fetch, gerçek kullanıcının izlediği yolun aynısıdır.
 */
async function fetchInPage(page, url) {
  return page.evaluate(async (target) => {
    const response = await fetch(target);
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text(),
    };
  }, url);
}

const unique = Date.now().toString().slice(-7);
const NAME = `Silme Testi ${unique}`;
// Bu betiğe özgü numara: telefon kullanıcının kimliğidir, başka betiklerle
// çakışmamalı.
const PHONE = `0533 ${unique.slice(0, 3)} ${unique.slice(3, 5)} ${unique.slice(5, 7)}`;
const NORMALIZED = `90533${unique}`.slice(0, 12);

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

/** Verilen sayfayla bir rezervasyon oluşturur, bilet kodunu döner. */
async function book(target) {
  await target.goto(`${BASE}/rezervasyon/elektrikli-sup-deneyimi`, { waitUntil: 'networkidle' });
  await target.waitForTimeout(400);

  const slot = target.locator('button[aria-pressed]:not([disabled])').filter({ hasText: 'yer' }).first();
  if ((await slot.count()) === 0) return null;

  await slot.click();
  await target.getByLabel('Ad Soyad').fill(NAME);
  await target.getByLabel('Telefon').fill(PHONE);
  await target.getByRole('button', { name: 'Rezervasyonu Tamamla' }).first().click();
  await target.waitForURL(/\/bilet\//, { timeout: 15000 });
  return decodeURIComponent(new URL(target.url()).pathname.split('/').pop());
}

const code = await book(page);
check('test rezervasyonu oluşturuldu', Boolean(code), code ?? 'oluşturulamadı');

const userRow = (await query('SELECT * FROM users WHERE name = ?', [NAME]))[0];
check('kullanıcı kaydı oluştu', Boolean(userRow), userRow?.id);

// ---------- 1. Dışa aktarma ----------

const exportResponse = await fetchInPage(page, '/hesabim/verilerim');
check('dışa aktarma indirilebiliyor', exportResponse.status === 200, `HTTP ${exportResponse.status}`);
check(
  'dosya indirme başlığı gönderiliyor',
  (exportResponse.headers['content-disposition'] ?? '').includes('attachment'),
  exportResponse.headers['content-disposition']
);
check(
  'dışa aktarma önbelleğe alınmıyor',
  (exportResponse.headers['cache-control'] ?? '').includes('no-store'),
  exportResponse.headers['cache-control']
);

const exported = JSON.parse(exportResponse.body);
check('dışa aktarmada ad var', exported.hesap?.ad === NAME, exported.hesap?.ad);
check('dışa aktarmada telefon var', Boolean(exported.hesap?.telefon), exported.hesap?.telefon);
check(
  'dışa aktarmada rezervasyon var',
  exported.rezervasyonlar?.some((b) => b.code === code),
  `${exported.rezervasyonlar?.length} rezervasyon`
);
check(
  'dışa aktarmada işlem günlüğü var',
  Array.isArray(exported.islemGunlugu) && exported.islemGunlugu.length > 0,
  `${exported.islemGunlugu?.length} kayıt`
);

// ---------- 2. Oturumsuz dışa aktarma reddediliyor ----------

const anon = await browser.newContext();
const anonPage = await anon.newPage();
await anonPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
const anonResponse = await fetchInPage(anonPage, '/hesabim/verilerim');
check('oturumsuz dışa aktarma reddediliyor', anonResponse.status === 401, `HTTP ${anonResponse.status}`);
await anon.close();

// ---------- 3. Aktif rezervasyon varken silme reddediliyor ----------

await page.goto(`${BASE}/hesabim`, { waitUntil: 'networkidle' });
check('hesap sayfası açılıyor', /\/hesabim/.test(page.url()), page.url());

await page.fill('#confirm', 'SİL');
await page.getByRole('button', { name: /Hesabımı Kalıcı Olarak Sil/ }).click();
await page.waitForTimeout(1500);

check(
  'aktif rezervasyon varken silme reddediliyor',
  await page.getByText('Aktif rezervasyonunuz var').isVisible()
);
check(
  'hesap hâlâ duruyor',
  (await query('SELECT * FROM users WHERE id = ?', [userRow.id]))[0]?.deleted_at === null
);

// Yanlış onay metni de reddedilmeli.
await page.fill('#confirm', 'evet');
await page.getByRole('button', { name: /Hesabımı Kalıcı Olarak Sil/ }).click();
await page.waitForTimeout(1200);
check(
  'yanlış onay metni reddediliyor',
  await page.getByRole('alert').getByText('kutuya SİL yazın').isVisible()
);

// ---------- 4. Onaylayarak silme ----------

await page.goto(`${BASE}/hesabim`, { waitUntil: 'networkidle' });
await page.check('input[name="cancelActive"]');
await page.fill('#confirm', 'SİL');
await page.getByRole('button', { name: /Hesabımı Kalıcı Olarak Sil/ }).click();
await page.waitForURL(/hesap=silindi/, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1000);

const afterDelete = (await query('SELECT * FROM users WHERE id = ?', [userRow.id]))[0];
check('hesap silinmiş olarak işaretlendi', Boolean(afterDelete?.deleted_at), afterDelete?.deleted_at);
check('ad artık veritabanında yok', afterDelete?.name !== NAME, afterDelete?.name);
check('telefon artık veritabanında yok', afterDelete?.phone !== NORMALIZED, afterDelete?.phone);
check(
  'telefon yer tutucusu numaradan türetilmemiş',
  !String(afterDelete?.phone ?? '').includes(unique),
  'aksi hâlde numarayı bilen kayıtla eşleştirebilirdi'
);

// Tüm users tablosunda o ad ve numara hiç geçmemeli.
const anyTrace = Number(
  (
    await query('SELECT COUNT(*) AS n FROM users WHERE name = ? OR phone = ?', [NAME, NORMALIZED])
  )[0].n
);
check('ad ve numara users tablosunun hiçbir yerinde yok', anyTrace === 0, `${anyTrace} eşleşme`);

// ---------- 5. Rezervasyon kayıtları duruyor ama kimseye işaret etmiyor ----------

const booking = (await query('SELECT * FROM bookings WHERE code = ?', [code]))[0];
check('rezervasyon kaydı korundu (10 yıllık zamanaşımı)', Boolean(booking), booking?.status);
check('rezervasyon iptal edildi', booking?.status === 'cancelled', booking?.status);
check('rezervasyon artık silinmiş hesaba bağlı', booking?.user_id === userRow.id);

// ---------- 6. İşlem günlüğünde de kişisel veri yok ----------

const auditText = JSON.stringify(await query('SELECT * FROM audit_log'));
check('silinen kişinin adı günlükte yok', !auditText.includes(NAME));
check('silinen kişinin numarası günlükte yok', !auditText.includes(NORMALIZED));
check(
  'silme işlemi günlüğe kaydedildi',
  Number((await query("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'account.deleted'"))[0].n) >= 1
);
check(
  'dışa aktarma günlüğe kaydedildi',
  Number((await query("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'account.exported'"))[0].n) >= 1
);

// ---------- 7. Kalmış çerez artık geçmiyor ----------
//
// Çerez 90 gün geçerli ve imzası hesap silinince bozulmaz. Silinen hesabın
// başka bir cihazda kalan oturumu geçmişi açmaya devam etmemeli.

const stale = await browser.newContext({ viewport: { width: 390, height: 844 } });
const stalePage = await stale.newPage();
await stale.addCookies(await ctx.cookies());

await stalePage.goto(`${BASE}/hesabim`, { waitUntil: 'networkidle' });
check(
  'silinen hesabın kalmış çerezi hesap sayfasını açmıyor',
  !/\/hesabim/.test(stalePage.url()),
  stalePage.url()
);

const staleExport = await fetchInPage(stalePage, '/hesabim/verilerim');
check(
  'silinen hesabın kalmış çerezi veri indiremiyor',
  staleExport.status === 401,
  `HTTP ${staleExport.status}`
);

await stalePage.goto(`${BASE}/rezervasyonlarim`, { waitUntil: 'networkidle' });
check(
  'silinen hesabın kalmış çerezi rezervasyonları göstermiyor',
  await stalePage.getByText('Henüz rezervasyonun yok').isVisible()
);
await stale.close();

// ---------- 8. Aynı numarayla yeniden kayıt ----------

const rebornCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const reborn = await rebornCtx.newPage();
const newCode = await book(reborn);

check('aynı numarayla yeniden rezervasyon yapılabiliyor', Boolean(newCode), newCode ?? 'yapılamadı');

const newUser = (await query('SELECT * FROM users WHERE phone = ?', [NORMALIZED]))[0];
check('yeni bir hesap oluştu', Boolean(newUser), newUser?.id);
check(
  'yeni hesap eskisinden farklı',
  newUser?.id !== userRow.id,
  'silinen hesap diriltilmiyor'
);

const rebornBookings = Number(
  (await query('SELECT COUNT(*) AS n FROM bookings WHERE user_id = ?', [newUser?.id ?? '']))[0].n
);
check(
  'yeni hesap eski rezervasyonları görmüyor',
  rebornBookings === 1,
  `${rebornBookings} rezervasyon`
);
await rebornCtx.close();

await ctx.close();
await browser.close();
await store.close();
console.log(`(motor: ${usingPostgres ? 'Postgres' : 'SQLite'})\n`);

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
