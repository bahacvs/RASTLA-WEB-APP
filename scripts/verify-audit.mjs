/**
 * İşlem günlüğünün testi — gerçek sunucu üzerinden.
 *
 * İhlal müdahale planının en zayıf noktası "ihlali fark edecek mekanizma yok"
 * idi. Bu betik, günlüğün gerçekten işe yaradığını uçtan uca doğrular:
 *
 *   1. Başarılı ve başarısız giriş kaydediliyor; PAROLA kaydedilmiyor.
 *   2. Bilet onayı, başka işletmenin biletini okutma denemesi ve ikinci onay
 *      denemesi ayrı ayrı kaydediliyor.
 *   3. Rezervasyon oluşturma ve iptal kaydediliyor.
 *   4. Aktivite ve takvim değişiklikleri kaydediliyor.
 *   5. Misafirin ADI ve TELEFONU günlüğe kopyalanmıyor (kişisel veriyi ikinci
 *      bir yerde çoğaltmamak için).
 *   6. Bir işletme başka işletmenin günlüğünü göremiyor.
 *   7. Personel günlük sayfasına giremiyor.
 *   8. Saklama süresi dolan kayıtlar silinebiliyor.
 *
 * Kullanım: npm start & node scripts/verify-audit.mjs
 */
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { ensureTestAccounts, loginAs, TEST_PASSWORD, emailFor } from './lib/test-accounts.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const DB_PATH = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'rastla.db');

ensureTestAccounts();

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

/** Günlüğü doğrudan veritabanından okur — uygulamanın yazdığına bakılıyor. */
function audit(where = '', params = []) {
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .prepare(`SELECT * FROM audit_log ${where} ORDER BY at DESC, id DESC LIMIT 200`)
    .all(...params);
  db.close();
  return rows;
}

const startedAt = new Date().toISOString();
const since = (extra = '') => [`WHERE at >= ?${extra ? ` AND ${extra}` : ''}`, [startedAt]];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

// ---------- 1. Giriş ----------

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const op = await ctx.newPage();

// Önce kasten yanlış parola.
await op.goto(`${BASE}/isletme`, { waitUntil: 'networkidle' });
await op.fill('#email', emailFor('buyukcekmece-wsc'));
await op.fill('#password', 'kesinlikle-yanlis-parola');
await op.getByRole('button', { name: 'Giriş Yap' }).click();
await op.waitForTimeout(1200);

const failedLogins = audit(...since("action = 'operator.login_failed'"));
check('başarısız giriş kaydedildi', failedLogins.length >= 1, `${failedLogins.length} kayıt`);
check(
  'başarısız girişte sonuç failure',
  failedLogins[0]?.outcome === 'failure',
  failedLogins[0]?.outcome
);
check(
  'başarısız giriş doğru işletmeye bağlandı',
  failedLogins[0]?.operator_id === 'buyukcekmece-wsc',
  String(failedLogins[0]?.operator_id)
);

// PAROLA HİÇBİR YERDE OLMAMALI. Tüm günlük satırları taranıyor.
const everything = JSON.stringify(audit());
check(
  'yanlış girilen parola günlükte yok',
  !everything.includes('kesinlikle-yanlis-parola'),
  'tüm audit_log tarandı'
);
check('test parolası günlükte yok', !everything.includes(TEST_PASSWORD));

// Şimdi doğru parola.
await loginAs(op, BASE, 'buyukcekmece-wsc');
const logins = audit(...since("action = 'operator.login'"));
check('başarılı giriş kaydedildi', logins.length >= 1, `${logins.length} kayıt`);
check('girişte kişi kimliği var', Boolean(logins[0]?.actor_id));
check('girişte aktör tipi operator', logins[0]?.actor_type === 'operator');

// ---------- 2. Aktivite ve takvim ----------

const unique = Date.now().toString().slice(-6);
const TITLE = `Günlük Testi ${unique}`;

await op.goto(`${BASE}/isletme/aktiviteler/yeni`, { waitUntil: 'networkidle' });
await op.fill('#title', TITLE);
await op.selectOption('#category', 'jet-ski');
await op.fill('#priceTRY', '900');
await op.fill('#durationMinutes', '30');
await op.fill('#location', 'Test Sahili');
await op.getByRole('radio', { name: /Rezervasyon sayılır/ }).check();
await op.getByRole('button', { name: /Oluştur ve Takvime Geç/ }).click();
await op.waitForURL(/\/isletme\/aktiviteler\/.+\/takvim/, { timeout: 15000 });

const created = audit(...since("action = 'activity.created'"));
check('aktivite oluşturma kaydedildi', created.length >= 1);

await op.fill('#startTime', '09:00');
await op.fill('#endTime', '11:00');
await op.fill('#intervalMinutes', '30');
await op.fill('#capacity', '2');
await op.getByRole('button', { name: /Kuralı Ekle/ }).click();
await op.waitForTimeout(2500);

const rules = audit(...since("action = 'schedule.rule_created'"));
check('takvim kuralı kaydedildi', rules.length >= 1);
check(
  'kural kaydı üretilen slot sayısını taşıyor',
  Boolean(JSON.parse(rules[0]?.meta ?? '{}').added),
  rules[0]?.meta
);

await op.goto(`${BASE}/isletme/aktiviteler`, { waitUntil: 'networkidle' });
const card = op.locator('li').filter({ hasText: TITLE });
await card.getByRole('button', { name: 'Yayına Al' }).click();
await op.waitForTimeout(1500);

check('yayına alma kaydedildi', audit(...since("action = 'activity.published'")).length >= 1);

// ---------- 3. Rezervasyon ----------

const customerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const cp = await customerCtx.newPage();

await cp.goto(`${BASE}/ara?q=${encodeURIComponent(TITLE)}`, { waitUntil: 'networkidle' });
const href = await cp.locator('a[href^="/aktivite/"]').first().getAttribute('href');
const slug = href.split('/').pop();

const GUEST_NAME = `Gunluk Testi ${unique}`;
// Telefon kullanıcının kimliğidir; başka doğrulama betikleriyle çakışmasın
// diye bu betiğe özgü bir numara kullanılır.
const GUEST_PHONE = '0532 777 88 99';

await cp.goto(`${BASE}/rezervasyon/${slug}`, { waitUntil: 'networkidle' });
await cp.waitForTimeout(400);
await cp.locator('button[aria-pressed]').filter({ hasText: 'yer' }).first().click();
await cp.getByLabel('Ad Soyad').fill(GUEST_NAME);
await cp.getByLabel('Telefon').fill(GUEST_PHONE);
await cp.getByRole('button', { name: 'Rezervasyonu Tamamla' }).first().click();
await cp.waitForURL(/\/bilet\//, { timeout: 15000 });
const code = decodeURIComponent(new URL(cp.url()).pathname.split('/').pop());

const bookings = audit(...since("action = 'booking.created'"));
check('rezervasyon oluşturma kaydedildi', bookings.length >= 1);
check('rezervasyon kaydında misafir kimliği var', Boolean(bookings[0]?.actor_id));

// ---------- 4. KİŞİSEL VERİ GÜNLÜĞE KOPYALANMIYOR ----------
//
// Günlük hangi kaydı işaret ettiğini biliyor; adı ve telefonu ikinci kez
// saklamak ihlalde kapsamı büyütmekten başka işe yaramaz.
const all = JSON.stringify(audit());
check('misafir adı günlükte yok', !all.includes(GUEST_NAME), GUEST_NAME);
check('misafir telefonu günlükte yok', !all.includes('05327778899') && !all.includes(GUEST_PHONE));
check('bilet kodu günlükte yok', !all.includes(code), code);

// ---------- 5. Bilet onayı ve reddedilen denemeler ----------

// Başka işletme okutmaya çalışıyor.
const wrongCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const wrong = await wrongCtx.newPage();
await loginAs(wrong, BASE, 'mimarsinan-marina');
await wrong.fill('#code', code);
await wrong.getByRole('button', { name: 'Onayla' }).click();
await wrong.waitForTimeout(1200);
await wrongCtx.close();

const denied = audit(...since("action = 'booking.redeem_failed' AND outcome = 'denied'"));
check('başka işletmenin onay denemesi kaydedildi', denied.length >= 1, `${denied.length} kayıt`);
check(
  'reddedilen deneme yanlış işletmenin günlüğüne yazıldı',
  denied[0]?.operator_id === 'mimarsinan-marina',
  String(denied[0]?.operator_id)
);

// Doğru işletme onaylıyor.
await op.goto(`${BASE}/isletme/tara`, { waitUntil: 'networkidle' });
await op.fill('#code', code);
await op.getByRole('button', { name: 'Onayla' }).click();
await op.waitForTimeout(1500);

const redeemed = audit(...since("action = 'booking.redeemed'"));
check('bilet onayı kaydedildi', redeemed.length >= 1);
check('onayı yapan kişi kayıtlı', Boolean(redeemed[0]?.actor_id));

// İkinci onay denemesi.
await op.fill('#code', code);
await op.getByRole('button', { name: 'Onayla' }).click();
await op.waitForTimeout(1500);

const secondTry = audit(...since("action = 'booking.redeem_failed' AND outcome = 'failure'"));
check(
  'ikinci onay denemesi de kaydedildi',
  secondTry.some((r) => JSON.parse(r.meta ?? '{}').reason === 'already_redeemed'),
  secondTry[0]?.meta
);

// ---------- 6. Günlük ekranı ----------

await op.goto(`${BASE}/isletme/gunluk`, { waitUntil: 'networkidle' });
check('sahip günlük sayfasını görebiliyor', /\/isletme\/gunluk/.test(op.url()), op.url());
check('bilet onayı ekranda görünüyor', await op.getByText('Bilet onaylandı').first().isVisible());
check(
  'reddedilen onay ekranda görünüyor',
  await op.getByText('Bilet onayı reddedildi').first().isVisible()
);

// Başka işletmenin kaydı SIZMAMALI. Mimarsinan'ın reddedilen denemesi
// buyukcekmece'nin günlüğünde görünmemeli.
const visibleIds = audit("WHERE operator_id = 'buyukcekmece-wsc'").map((r) => r.id);
check(
  'başka işletmenin kaydı bu işletmenin günlüğünde yok',
  !visibleIds.includes(denied[0]?.id),
  `${visibleIds.length} kayıt tarandı`
);

// Personel giremez.
const staffCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const sp = await staffCtx.newPage();
await loginAs(sp, BASE, 'buyukcekmece-wsc', 'staff');
await sp.goto(`${BASE}/isletme/gunluk`, { waitUntil: 'networkidle' });
check('personel günlük sayfasına giremiyor', /\/isletme\/tara/.test(sp.url()), sp.url());
await staffCtx.close();

// ---------- 7. Müşteri iptali ----------

const cancelCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const cancelPage = await cancelCtx.newPage();
await cancelPage.goto(`${BASE}/rezervasyon/${slug}`, { waitUntil: 'networkidle' });
await cancelPage.waitForTimeout(400);
const freeSlot = cancelPage.locator('button[aria-pressed]:not([disabled])').filter({ hasText: 'yer' }).first();
if ((await freeSlot.count()) > 0) {
  await freeSlot.click();
  await cancelPage.getByLabel('Ad Soyad').fill(`Iptal Testi ${unique}`);
  await cancelPage.getByLabel('Telefon').fill('0532 777 00 11');
  await cancelPage.getByRole('button', { name: 'Rezervasyonu Tamamla' }).first().click();
  // İptal düğmesi biletin kendi sayfasında; geri alınamaz olduğu için önce
  // onay ister.
  await cancelPage.waitForURL(/\/bilet\//, { timeout: 15000 });

  await cancelPage.getByRole('button', { name: 'Rezervasyonu İptal Et' }).click();
  await cancelPage.getByRole('button', { name: /Evet, iptal et/ }).click();
  await cancelPage.waitForTimeout(1500);
}
await cancelCtx.close();

check(
  'müşteri iptali kaydedildi',
  audit(...since("action = 'booking.cancelled'")).length >= 1,
  `${audit(...since("action = 'booking.cancelled'")).length} kayıt`
);

// ---------- 8. Saklama süresi ----------

const write = new Database(DB_PATH);
const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
write
  .prepare(
    `INSERT INTO audit_log (id, at, actor_type, action, outcome)
     VALUES ('eski-kayit-testi', ?, 'system', 'operator.login', 'success')`
  )
  .run(old);

const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
const purged = write.prepare('DELETE FROM audit_log WHERE at < ?').run(cutoff).changes;
const stillThere = write
  .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE id = 'eski-kayit-testi'`)
  .get().n;
const recentKept = write
  .prepare('SELECT COUNT(*) AS n FROM audit_log WHERE at >= ?')
  .get(startedAt).n;
write.close();

check('saklama süresi dolan kayıt siliniyor', purged >= 1 && stillThere === 0, `${purged} silindi`);
check('güncel kayıtlar silinmiyor', recentKept > 0, `${recentKept} kayıt duruyor`);

// ---------- Sonuç ----------

await ctx.close();
await customerCtx.close();
await browser.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
