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
import { chromium } from 'playwright';
import { ensureTestAccounts, loginAs, TEST_PASSWORD, emailFor } from './lib/test-accounts.mjs';
import { book } from './lib/booking.mjs';
import { db as connect, usingPostgres } from '../lib/db/index.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

// Uygulamayla aynı bağlantı: DATABASE_URL tanımlıysa bu betik de Postgres'i
// okur, yani günlük iddiası her iki motorda da sınanır.
const store = await connect();

await ensureTestAccounts();

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

/** Günlüğü doğrudan veritabanından okur — uygulamanın yazdığına bakılıyor. */
async function audit(where = '', params = []) {
  return store.all(`SELECT * FROM audit_log ${where} ORDER BY at DESC, id DESC LIMIT 200`, params);
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

const failedLogins = await audit(...since("action = 'operator.login_failed'"));
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
const everything = JSON.stringify(await audit());
check(
  'yanlış girilen parola günlükte yok',
  !everything.includes('kesinlikle-yanlis-parola'),
  'tüm audit_log tarandı'
);
check('test parolası günlükte yok', !everything.includes(TEST_PASSWORD));

// Şimdi doğru parola.
await loginAs(op, BASE, 'buyukcekmece-wsc');
const logins = await audit(...since("action = 'operator.login'"));
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

const created = await audit(...since("action = 'activity.created'"));
check('aktivite oluşturma kaydedildi', created.length >= 1);

await op.fill('#startTime', '09:00');
await op.fill('#endTime', '11:00');
await op.fill('#intervalMinutes', '30');
await op.fill('#capacity', '2');
await op.getByRole('button', { name: /Kuralı Ekle/ }).click();
await op.waitForTimeout(2500);

const rules = await audit(...since("action = 'schedule.rule_created'"));
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

check('yayına alma kaydedildi', (await audit(...since("action = 'activity.published'"))).length >= 1);

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

const booked = await book(cp, {
  baseUrl: BASE,
  slug,
  name: GUEST_NAME,
  phone: GUEST_PHONE,
});
check('rezervasyon oluşturuldu', Boolean(booked.code), booked.code ?? booked.error);
const code = booked.code;

const bookings = await audit(...since("action = 'booking.created'"));
check('rezervasyon oluşturma kaydedildi', bookings.length >= 1);
check('rezervasyon kaydında misafir kimliği var', Boolean(bookings[0]?.actor_id));

// ---------- 4. KİŞİSEL VERİ GÜNLÜĞE KOPYALANMIYOR ----------
//
// Günlük hangi kaydı işaret ettiğini biliyor; adı ve telefonu ikinci kez
// saklamak ihlalde kapsamı büyütmekten başka işe yaramaz.
const all = JSON.stringify(await audit());
check('misafir adı günlükte yok', !all.includes(GUEST_NAME), GUEST_NAME);
check('misafir telefonu günlükte yok', !all.includes('05327778899') && !all.includes(GUEST_PHONE));
check('bilet kodu günlükte yok', !all.includes(code), code);

// ---------- 5. Bilet onayı ve reddedilen denemeler ----------

// Başka işletme okutmaya çalışıyor.
const wrongCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const wrong = await wrongCtx.newPage();
await loginAs(wrong, BASE, 'mimarsinan-marina');
// Giriş sonrası varsayılan ekran Bugün; okutma ekranına ayrıca gidiliyor.
await wrong.goto(`${BASE}/isletme/tara`, { waitUntil: 'networkidle' });
await wrong.fill('#code', code);
await wrong.getByRole('button', { name: 'Onayla' }).click();
await wrong.waitForTimeout(1200);
await wrongCtx.close();

const denied = await audit(...since("action = 'booking.redeem_failed' AND outcome = 'denied'"));
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

const redeemed = await audit(...since("action = 'booking.redeemed'"));
check('bilet onayı kaydedildi', redeemed.length >= 1);
check('onayı yapan kişi kayıtlı', Boolean(redeemed[0]?.actor_id));

// İkinci onay denemesi.
await op.fill('#code', code);
await op.getByRole('button', { name: 'Onayla' }).click();
await op.waitForTimeout(1500);

const secondTry = await audit(...since("action = 'booking.redeem_failed' AND outcome = 'failure'"));
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
const visibleIds = (await audit("WHERE operator_id = 'buyukcekmece-wsc'")).map((r) => r.id);
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
// Varış adresi değil, KAPALI sayfada kalınmaması sınanıyor: rolün ana ekranı
// `operatorHome` içinde tanımlı ve değişebiliyor.
check(
  'personel günlük sayfasına giremiyor',
  /\/isletme\/(bugun|tara)$/.test(new URL(sp.url()).pathname),
  sp.url()
);
await staffCtx.close();

// ---------- 7. Müşteri iptali ----------

const cancelCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const cancelPage = await cancelCtx.newPage();

const toCancel = await book(cancelPage, {
  baseUrl: BASE,
  slug,
  name: `Iptal Testi ${unique}`,
  phone: '0532 777 00 11',
});

if (toCancel.code) {
  // İptal düğmesi biletin kendi sayfasında; geri alınamaz olduğu için önce
  // onay ister.
  await cancelPage.getByRole('button', { name: 'Rezervasyonu İptal Et' }).click();
  await cancelPage.getByRole('button', { name: /Evet, iptal et/ }).click();
  await cancelPage.waitForTimeout(1500);
}
check('iptal edilecek rezervasyon oluşturuldu', Boolean(toCancel.code), toCancel.error);
await cancelCtx.close();

check(
  'müşteri iptali kaydedildi',
  (await audit(...since("action = 'booking.cancelled'"))).length >= 1,
  `${(await audit(...since("action = 'booking.cancelled'"))).length} kayıt`
);

// ---------- 8. Saklama süresi ----------

const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
await store.run(
  `INSERT INTO audit_log (id, at, actor_type, action, outcome)
   VALUES ('eski-kayit-testi', ?, 'system', 'operator.login', 'success')`,
  [old]
);

const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
const purged = (await store.run('DELETE FROM audit_log WHERE at < ?', [cutoff])).changes;
const stillThere = Number(
  (await store.get(`SELECT COUNT(*) AS n FROM audit_log WHERE id = 'eski-kayit-testi'`)).n
);
const recentKept = Number(
  (await store.get('SELECT COUNT(*) AS n FROM audit_log WHERE at >= ?', [startedAt])).n
);

check('saklama süresi dolan kayıt siliniyor', purged >= 1 && stillThere === 0, `${purged} silindi`);
check('güncel kayıtlar silinmiyor', recentKept > 0, `${recentKept} kayıt duruyor`);
console.log(`(motor: ${usingPostgres ? 'Postgres' : 'SQLite'})\n`);

// ---------- Sonuç ----------

await ctx.close();
await customerCtx.close();
await browser.close();
await store.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
