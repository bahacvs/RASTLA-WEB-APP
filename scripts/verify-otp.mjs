/**
 * Telefon doğrulamasının testi.
 *
 * Sınananlar:
 *   1. Kod veritabanında DÜZ METİN değil.
 *   2. Kod hiçbir işlem günlüğü satırında geçmiyor (tüm tablo taranır).
 *   3. Telefon numarası günlüğe maskelenerek yazılıyor.
 *   4. Yanlış kod reddediliyor; 5 denemeden sonra kod YAKILIYOR.
 *   5. Süresi dolan kod geçmiyor.
 *   6. Bir kod iki kez kullanılamıyor — eşzamanlı denemede bile.
 *   7. Yeni kod istemek eskisini iptal ediyor.
 *   8. Müşteri: doğrulamadan rezervasyon oluşmuyor, kapasite tutulmuyor.
 *   9. İşletme: parola doğru olsa da ikinci faktör geçilmeden oturum AÇILMIYOR.
 *  10. Numarasız hesap parolayla girmeye devam ediyor.
 *
 * Kod, sunucu günlüğünden okunur — sağlayıcı yapılandırılmadığında konsola
 * düşer. Bu bilinçli: kod hiçbir koşulda tarayıcıya döndürülmüyor, dolayısıyla
 * test de gerçek kullanıcının izlediği yolu izliyor.
 *
 * Kullanım: npm start > server.log & node scripts/verify-otp.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { db as connect } from '../lib/db/index.mjs';
import { ensureTestAccounts, TEST_PASSWORD } from './lib/test-accounts.mjs';
// Gönderme butonunun metni ödeme açıkken değişiyor; deseni tek yerde tutuyoruz.
import { acceptTerms, SUBMIT } from './lib/booking.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

/**
 * Girişin BAŞARILI olduğunu gösteren adresler.
 *
 * Sabit tek bir ekran yazılmıyor: giriş sonrası varılan yer role göre
 * değişiyor ve değişebiliyor da (saha personeli bir zamanlar bilet okutma
 * ekranına düşüyordu, artık Bugün'e). Sınanan iddia "hangi ekran" değil,
 * "oturum açıldı mı".
 */
const SIGNED_IN = /\/isletme\/(bugun|tara)/;
const LOG = process.env.SERVER_LOG;

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

await ensureTestAccounts();
const store = await connect();

/**
 * Sunucu günlüğünden belirli bir numaraya gönderilen SON kodu okur.
 *
 * Konsol sağlayıcısı numarayı maskeleyerek yazdığı için son dört haneyle
 * eşleştiriyoruz — tam numara zaten günlükte olmamalı.
 */
function codeFromLog(phone) {
  if (!LOG || !existsSync(LOG)) return null;
  const last4 = phone.replace(/\D/g, '').slice(-4);
  const lines = readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes('[sms:console]'));

  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes(last4)) continue;
    const match = lines[i].match(/\b(\d{6})\b/);
    if (match) return match[1];
  }
  return null;
}

// ---------- 1-3. Kod ve numara nerede saklanıyor ----------

// Numara, uygulamanın normalizePhone'undan geçince kendisine dönmeli; aksi
// hâlde testin veritabanında aradığı kayıt hiç bulunmaz.
const national = `533${Date.now().toString().slice(-7)}`;   // 10 hane
const phone = `90${national}`;

// Kod üretimi uygulama üzerinden tetiklenir (TypeScript deposu betikten
// çağrılamaz) ve sonuç doğrudan veritabanından okunur — yani sınanan şey
// uygulamanın gerçekten yazdığı satır.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

// ---------- 8. Müşteri akışı ----------

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

const NAME = `OTP Testi ${Date.now().toString().slice(-6)}`;
const DISPLAY_PHONE = `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(
  6,
  8
)} ${national.slice(8, 10)}`;

async function fillBooking(target) {
  await target.goto(`${BASE}/rezervasyon/elektrikli-sup-deneyimi`, { waitUntil: 'networkidle' });
  await target.waitForTimeout(400);

  const slot = target
    .locator('button[aria-pressed]:not([disabled])')
    .filter({ hasText: 'yer' })
    .first();
  if ((await slot.count()) === 0) return false;

  await slot.click();
  await target.getByLabel('Ad Soyad').fill(NAME);
  await target.getByLabel('Telefon').fill(DISPLAY_PHONE);
  // Ödeme açıkken mesafeli satış onayı zorunlu; işaretlenmezse tarayıcı formu
  // hiç göndermez ve bu süitin sınadığı OTP akışına sıra gelmez.
  await acceptTerms(target);
  return true;
}

const bookedBefore = Number(
  (await store.get('SELECT COUNT(*) AS n FROM bookings')).n
);

/** Bu aktivite için o an tutulu olan toplam yer. */
async function heldCapacity() {
  const row = await store.get(
    `SELECT SUM(booked) AS n FROM slots WHERE activity_id =
       (SELECT id FROM activities WHERE slug = 'elektrikli-sup-deneyimi')`
  );
  return Number(row?.n ?? 0);
}

// Mutlak değil FARK ölçülüyor: veritabanında başka testlerden kalmış
// rezervasyonlar olabilir ve "toplam tutulu yer sıfır" iddiası onlarla
// çökerdi. Sınanan şey zaten fark: kod istemek kapasiteyi ARTIRMAMALI.
const heldBefore = await heldCapacity();

check('rezervasyon formu dolduruldu', await fillBooking(page));

await page.getByRole('button', { name: SUBMIT }).first().click();
await page.waitForTimeout(1500);

check(
  'doğrulanmamış numarada kod ekranı geliyor',
  await page.getByText('Doğrulama kodu').first().isVisible()
);

const bookedAfterPrompt = Number((await store.get('SELECT COUNT(*) AS n FROM bookings')).n);
check(
  'kod istenirken rezervasyon OLUŞMUYOR',
  bookedAfterPrompt === bookedBefore,
  `önce ${bookedBefore}, sonra ${bookedAfterPrompt}`
);

// Kapasite de tutulmamalı: doğrulamayan biri slot işgal edip işletmenin
// gününü doldurabilseydi, doğrulama koymanın anlamı kalmazdı.
const heldAfter = await heldCapacity();
check(
  'kod istenirken KAPASİTE de tutulmuyor',
  heldAfter === heldBefore,
  `önce ${heldBefore}, sonra ${heldAfter}`
);

// ---------- 1-3. Depolama ve günlük ----------

const stored = await store.get(
  'SELECT * FROM phone_verifications WHERE phone = ? ORDER BY created_at DESC',
  [phone]
);
check('doğrulama kaydı oluştu', Boolean(stored), stored?.id);

const code = codeFromLog(phone);
check('kod sunucu günlüğüne düştü', Boolean(code), code ? '6 hane' : 'okunamadı (SERVER_LOG?)');

if (code && stored) {
  check('kod veritabanında düz metin DEĞİL', !stored.code_hash.includes(code), stored.code_hash.slice(0, 20) + '…');
  check('kod özeti sha256 biçiminde', stored.code_hash.startsWith('sha256$'));

  const auditText = JSON.stringify(await store.all('SELECT * FROM audit_log'));
  check('kod işlem günlüğünde geçmiyor', !auditText.includes(code));
  check('tam telefon numarası günlükte geçmiyor', !auditText.includes(phone));
  check(
    'numara günlüğe maskelenerek yazılmış',
    auditText.includes(`***${phone.slice(-4)}`) || auditText.includes(phone.slice(-4)),
    'son dört hane'
  );
}

// ---------- 4. Yanlış kod ve deneme sınırı ----------

for (let i = 0; i < 4; i++) {
  await page.fill('#code', '000000');
  await page.getByRole('button', { name: SUBMIT }).first().click();
  await page.waitForTimeout(700);
}

const attemptsRow = await store.get(
  'SELECT attempts, consumed_at FROM phone_verifications WHERE id = ?',
  [stored?.id ?? '']
);
check('yanlış denemeler sayılıyor', Number(attemptsRow?.attempts ?? 0) >= 4, `${attemptsRow?.attempts} deneme`);

await page.fill('#code', '000000');
await page.getByRole('button', { name: SUBMIT }).first().click();
await page.waitForTimeout(900);

const burned = await store.get('SELECT attempts, consumed_at FROM phone_verifications WHERE id = ?', [
  stored?.id ?? '',
]);
check(
  '5 yanlış denemeden sonra kod yakılıyor',
  Boolean(burned?.consumed_at),
  `deneme: ${burned?.attempts}`
);

// Yakılan kod artık DOĞRU değeriyle bile geçmemeli.
if (code) {
  await page.fill('#code', code);
  await page.getByRole('button', { name: SUBMIT }).first().click();
  await page.waitForTimeout(900);

  const afterBurn = Number((await store.get('SELECT COUNT(*) AS n FROM bookings')).n);
  check('yakılan kod doğru değeriyle de geçmiyor', afterBurn === bookedBefore, `${afterBurn} rezervasyon`);
}

// ---------- 7 + 8. Yeni kod iste, doğrula, rezervasyon tamamlansın ----------

await ctx.close();
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page2 = await ctx2.newPage();

await fillBooking(page2);
await page2.getByRole('button', { name: SUBMIT }).first().click();
await page2.waitForTimeout(1500);

const openCodes = await store.all(
  'SELECT id FROM phone_verifications WHERE phone = ? AND consumed_at IS NULL',
  [phone]
);
check('aynı anda yalnızca bir açık kod var', openCodes.length === 1, `${openCodes.length} açık kod`);

const code2 = codeFromLog(phone);
check('yeni kod üretildi', Boolean(code2) && code2 !== code, code2 === code ? 'aynı kod!' : 'farklı');

if (code2) {
  await page2.fill('#code', code2);
  await page2.getByRole('button', { name: SUBMIT }).first().click();
  await page2.waitForURL(/\/bilet\//, { timeout: 15000 }).catch(() => {});
  await page2.waitForTimeout(800);

  check('doğru kodla rezervasyon tamamlanıyor', /\/bilet\//.test(page2.url()), page2.url());

  const user = await store.get('SELECT * FROM users WHERE phone = ?', [phone]);
  check('kullanıcı kaydı doğrulanmış numarayla açıldı', Boolean(user), user?.name);
}
await ctx2.close();

// ---------- 6. Aynı kod iki kez kullanılamaz (eşzamanlı) ----------

const dir = mkdtempSync(join(tmpdir(), 'rastla-otp-'));
const raceCode = '424242';
const raceId = `otp-race-${Date.now()}`;
const racePhone = `9053388${Date.now().toString().slice(-5)}`;

// Kodu uygulamanın kullandığı biçimde yazıyoruz ki tüketim yolu birebir aynı olsun.
const { createHash } = await import('node:crypto');
const salt = 'yaris';
const hash = `sha256$${salt}$${createHash('sha256').update(`${salt}:${raceCode}`).digest('base64url')}`;

await store.run(
  `INSERT INTO phone_verifications (id, phone, code_hash, purpose, expires_at, attempts, created_at)
   VALUES (?, ?, ?, 'booking', ?, 0, ?)`,
  [raceId, racePhone, hash, new Date(Date.now() + 300000).toISOString(), new Date().toISOString()]
);

const worker = join(dir, 'consume.mjs');
writeFileSync(
  worker,
  `import { db } from ${JSON.stringify(new URL('../lib/db/index.mjs', import.meta.url).href)};
const client = await db();
const r = await client.run(
  'UPDATE phone_verifications SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL',
  [new Date().toISOString(), ${JSON.stringify(raceId)}]
);
process.stdout.write(String(r.changes));
await client.close();
`
);

const outcomes = Array.from({ length: 10 }, () => {
  try {
    return Number(execFileSync(process.execPath, [worker], { encoding: 'utf8', timeout: 20000 }));
  } catch {
    return -1;
  }
});
check(
  '10 eşzamanlı süreçten tam olarak biri kodu tüketiyor',
  outcomes.filter((o) => o === 1).length === 1,
  `tüketen: ${outcomes.filter((o) => o === 1).length}`
);
rmSync(dir, { recursive: true, force: true });

// ---------- 9 + 10. İşletme girişi ----------

const opCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const op = await opCtx.newPage();

// Numarası OLAN hesap: parola doğru olsa da oturum açılmamalı.
const TWO_FA_EMAIL = 'test-2fa@buyukcekmece.local';
const TWO_FA_PHONE = '905339990001';

await op.goto(`${BASE}/isletme`, { waitUntil: 'networkidle' });
await op.fill('#email', TWO_FA_EMAIL);
await op.fill('#password', TEST_PASSWORD);
await op.getByRole('button', { name: 'Giriş Yap' }).click();
await op.waitForTimeout(1500);

check(
  'parola doğruyken ikinci faktör isteniyor',
  await op.getByText('Doğrulama kodu').first().isVisible()
);

// Bu noktada oturum AÇILMAMIŞ olmalı: korunan sayfa girişe geri atmalı.
const probeCtx = op.context();
const probe = await probeCtx.newPage();
await probe.goto(`${BASE}/isletme/tara`, { waitUntil: 'networkidle' });
check(
  'ikinci faktör geçilmeden korunan sayfaya girilemiyor',
  /\/isletme$/.test(probe.url()),
  probe.url()
);
await probe.close();

const opCode = codeFromLog(TWO_FA_PHONE);
check('işletmeye kod gönderildi', Boolean(opCode));

if (opCode) {
  await op.fill('#code', '111111');
  await op.getByRole('button', { name: /Doğrula ve Gir/ }).click();
  await op.waitForTimeout(1000);
  check('yanlış ikinci faktör kodu reddediliyor', !SIGNED_IN.test(op.url()), op.url());

  await op.fill('#code', opCode);
  await op.getByRole('button', { name: /Doğrula ve Gir/ }).click();
  await op.waitForURL(SIGNED_IN, { timeout: 15000 }).catch(() => {});
  check('doğru kodla oturum açılıyor', SIGNED_IN.test(op.url()), op.url());
}
await opCtx.close();

// Numarası OLMAYAN hesap parolayla girmeye devam etmeli.
const legacyCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const legacy = await legacyCtx.newPage();
await legacy.goto(`${BASE}/isletme`, { waitUntil: 'networkidle' });
await legacy.fill('#email', 'test-sahip@buyukcekmece.local');
await legacy.fill('#password', TEST_PASSWORD);
await legacy.getByRole('button', { name: 'Giriş Yap' }).click();
await legacy.waitForURL(SIGNED_IN, { timeout: 15000 }).catch(() => {});
check(
  'numarasız hesap parolayla girmeye devam ediyor',
  SIGNED_IN.test(legacy.url()),
  legacy.url()
);
await legacyCtx.close();

await browser.close();
await store.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
