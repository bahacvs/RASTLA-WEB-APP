/**
 * Kapora testi.
 *
 * İşletmenin en pahalı sorunu gelmeyen müşteri: tesiste ödemeli rezervasyonda
 * "gelmedim" bedava, insanlar üç yere birden yazılıyor ve işletme dolu
 * sandığı saati boş geçiriyor. Tamamını peşin istemek dönüşü düşürüyor.
 * Kapora ikisinin arasında ve tam da bu yüzden **iki tutarın birbirine
 * karışmaması** hayati: tahsil edilen tutar ile borcun tamamı ayrı ayrı
 * doğru olmalı, yoksa kasada tartışma çıkar.
 *
 * Sınananlar:
 *   1. Saf hesap: yüzde, yukarı yuvarlama, üst sınır, kaporasız durum.
 *   2. Kapora tanımlı ilanda sağlayıcıdan **kaporanın** tutarı isteniyor,
 *      rezervasyonun toplamı değil.
 *   3. Rezervasyon `payment_mode='deposit'` ve `deposit_try` kayıtlı; toplam
 *      DEĞİŞMİYOR — müşterinin borcu hâlâ tamamı.
 *   4. **Komisyon tahsil edilen tutardan** hesaplanıyor; tesiste ödenen
 *      kısımdan komisyon alınmıyor.
 *   5. Hak ediş kaydı da tahsil edilen tutar üzerinden açılıyor.
 *   6. İade yalnızca tahsil edileni geri veriyor — elimizde olmayan parayı
 *      iade edemeyiz.
 *   7. **Bugün ekranındaki "beklenen tahsilat" kaporayı DÜŞÜYOR.**
 *   8. Bilet ekranı ödenen ve tesiste ödenecek tutarı ayrı ayrı gösteriyor.
 *   9. Kapora oranı değişince GEÇMİŞ rezervasyonun kaporası değişmiyor.
 *  10. Geçersiz oran (%3, %90, yazı) reddediliyor; boş bırakmak kapatıyor.
 *  11. Online ödeme kapalıysa kapora tahsil edilmiyor ve kayıt kaporalı
 *      görünmüyor.
 *
 * Kullanım:
 *   PAYMENT_PROVIDER=fake npm start > server.log &
 *   SERVER_LOG=server.log node scripts/verify-deposit.mjs
 */
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { db as connect } from '../lib/db/index.mjs';
import { depositFor, paymentSplit } from '../lib/pricing.mjs';
import { ensureTestAccounts, loginAs } from './lib/test-accounts.mjs';
import { book, testPhone } from './lib/booking.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const OPERATOR = 'buyukcekmece-wsc';
const FREE_OPERATOR = 'mimarsinan-marina';
const COMMISSION_BP = 1800;
const PRICE = 1200;
const DEPOSIT_PERCENT = 20;

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const store = await connect();
await ensureTestAccounts();

const now = new Date().toISOString();
const tag = Date.now();

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------- saf hesap

check('kaporasız ilanda peşin tahsilat yok', depositFor(1000, null) === 0);
check('%20 kapora: 1000 → 200', depositFor(1000, 20) === 200, `${depositFor(1000, 20)}`);
check(
  'kapora YUKARI yuvarlanıyor: 999 × %20 = 200',
  depositFor(999, 20) === 200,
  `${depositFor(999, 20)}`
);
check(
  'kapora toplamı GEÇEMİYOR — "tesiste −X TL" diye bir şey yok',
  depositFor(50, 100) === 50 && depositFor(50, 200) === 50,
  `${depositFor(50, 200)}`
);
check(
  'ücretsiz aktivitede kapora sıfır',
  depositFor(0, 20) === 0
);

check(
  'bölme: kapora 200 ise tesiste 800 kalıyor',
  paymentSplit({ paymentMode: 'deposit', totalTRY: 1000, depositTRY: 200 }).onsiteTRY === 800
);
check(
  'tesiste ödemeli rezervasyonda peşin tahsilat 0',
  paymentSplit({ paymentMode: 'onsite', totalTRY: 1000 }).onlineTRY === 0
);
check(
  'tamamı online rezervasyonda tesiste ödenecek 0',
  paymentSplit({ paymentMode: 'online', totalTRY: 1000 }).onsiteTRY === 0
);
check(
  'kip deposit ama kapora yazılmamışsa tamamı tesiste görünüyor — sessizce "ödendi" sayılmıyor',
  paymentSplit({ paymentMode: 'deposit', totalTRY: 1000 }).onsiteTRY === 1000
);

// ---------------------------------------------------------------- kurulum

await store.run(`UPDATE operators SET submerchant_key = ?, commission_bp = ? WHERE id = ?`, [
  'test-submerchant-key',
  COMMISSION_BP,
  OPERATOR,
]);
await store.run(`UPDATE operators SET submerchant_key = NULL WHERE id = ?`, [FREE_OPERATOR]);

// Hız sınırı kovaları temizleniyor: bu süit birkaç rezervasyon açıyor ve
// aynı saatte koşan diğer süitlerle kovayı paylaşıyor. Sınırın kendisi
// verify-rate-limit.mjs içinde sınanıyor; burada sıfırlamak bir şey gizlemiyor.
await store.run('DELETE FROM rate_limits');

async function seedActivity(suffix, { operatorId = OPERATOR, depositPercent = null } = {}) {
  const id = randomUUID();
  const slug = `kapora-test-${suffix}-${tag}`;
  const date = futureDate(18);

  await store.run(
    `INSERT INTO activities (id, operator_id, slug, title, category, price_try, duration_minutes,
       location_name, capacity_mode, status, deposit_percent, created_at)
     VALUES (?, ?, ?, ?, 'jet-ski', ?, 30, 'Sahil', 'per_person', 'published', ?, ?)`,
    [id, operatorId, slug, `Kapora Testi ${suffix} ${tag}`, PRICE, depositPercent, now]
  );

  await store.run(
    `INSERT INTO slots (id, activity_id, slot_date, slot_time, capacity, booked, status, created_at)
     VALUES (?, ?, ?, '11:00', 20, 0, 'open', ?)`,
    [randomUUID(), id, date, now]
  );

  return { id, slug, date };
}

const withDeposit = await seedActivity('kaporali', { depositPercent: DEPOSIT_PERCENT });
const noProvider = await seedActivity('odemesiz', {
  operatorId: FREE_OPERATOR,
  depositPercent: DEPOSIT_PERCENT,
});

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

async function freshPage() {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/** Rezervasyonu ödeme adımına kadar götürüp orada durdurur. */
async function pendingBooking(prefix, slug) {
  const { context, page } = await freshPage();
  const phone = testPhone(prefix);

  const result = await book(page, {
    baseUrl: BASE,
    slug,
    name: `Kapora Misafiri ${prefix}`,
    phone: phone.display,
    people: 2,
    stopAtPayment: true,
  });
  await context.close();

  if (!result.paymentUrl) return { error: result.error ?? 'ödeme adımına gidilmedi' };

  const payment = await store.get(
    `SELECT p.* FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       JOIN users u ON u.id = b.user_id
      WHERE u.phone = ?
      ORDER BY p.created_at DESC`,
    [phone.normalized]
  );
  if (!payment) return { error: 'ödeme kaydı bulunamadı' };

  const booking = await store.get('SELECT * FROM bookings WHERE id = ?', [payment.booking_id]);

  return {
    payment,
    booking,
    token: payment.token,
    callbackUrl: `${BASE}/odeme/donus?token=${payment.token}`,
  };
}

// 2 kişi × 1200 = 2400; %20 kapora = 480.
const expectedTotal = PRICE * 2;
const expectedDeposit = depositFor(expectedTotal, DEPOSIT_PERCENT);

// ---------- 2 + 3 + 4. Tahsil edilen tutar ----------

const pending = await pendingBooking('5801', withDeposit.slug);

if (pending.error) {
  check('kaporalı ilanda ödeme adımına gidiliyor', false, pending.error);
} else {
  check('kaporalı ilanda ödeme adımına gidiliyor', true);

  check(
    'rezervasyonun TOPLAMI değişmiyor — müşterinin borcu hâlâ tamamı',
    Number(pending.booking.total_try) === expectedTotal,
    `toplam: ${pending.booking.total_try}, beklenen: ${expectedTotal}`
  );

  check(
    'kapora TUTAR olarak kaydediliyor',
    Number(pending.booking.deposit_try) === expectedDeposit,
    `kapora: ${pending.booking.deposit_try}, beklenen: ${expectedDeposit}`
  );

  check(
    "ödeme kipi 'deposit' olarak kaydediliyor",
    pending.booking.payment_mode === 'deposit',
    `kip: ${pending.booking.payment_mode}`
  );

  // Asıl güvence: sağlayıcıdan KAPORA isteniyor. Toplam istenseydi müşteriden
  // 2400 TL çekilirdi ve ekranda gördüğü 480 TL ile arasındaki fark, ürünün
  // güvenilirliğini tek seferde bitirirdi.
  check(
    'sağlayıcıdan KAPORA tahsil ediliyor, toplam değil',
    Number(pending.payment.amount_try) === expectedDeposit,
    `ödeme tutarı: ${pending.payment.amount_try} (toplam ${expectedTotal})`
  );

  check(
    'komisyon TAHSİL EDİLEN tutardan hesaplanıyor — tesiste ödenenden pay alınmıyor',
    Number(pending.payment.commission_try) ===
      Math.floor((expectedDeposit * COMMISSION_BP) / 10000),
    `komisyon: ${pending.payment.commission_try}, kapora: ${expectedDeposit}`
  );

  // ---------- 5 + 6. Hak ediş ve iade ----------

  const response = await fetch(pending.callbackUrl, { redirect: 'manual' });
  check(
    'ödeme geri çağrısı işleniyor',
    response.status >= 200 && response.status < 400,
    `HTTP ${response.status}`
  );

  const confirmed = await store.get('SELECT * FROM bookings WHERE id = ?', [pending.booking.id]);
  check(
    'ödeme sonrası rezervasyon onaylanıyor ve kapora KORUNUYOR',
    confirmed.status === 'confirmed' && Number(confirmed.deposit_try) === expectedDeposit,
    `${confirmed.status}, kapora ${confirmed.deposit_try}`
  );

  const payout = await store.get('SELECT * FROM payouts WHERE booking_id = ?', [
    pending.booking.id,
  ]);
  check(
    'hak ediş TAHSİL EDİLEN tutar üzerinden açılıyor',
    payout !== undefined && Number(payout.gross_try) === expectedDeposit,
    `brüt: ${payout?.gross_try}, kapora: ${expectedDeposit}`
  );

  // İade: elimizde olmayan parayı iade edemeyiz. Tesiste ödenen kısmı da
  // iade etmeye çalışan bir kod, RASTLA'yı hiç almadığı paradan borçlu
  // duruma düşürürdü.
  //
  // İade GERÇEK yoldan tetikleniyor — işletmenin hava iptali düğmesiyle.
  // Fonksiyonu doğrudan çağırmak, arayüzden o fonksiyona gerçekten
  // ulaşıldığını göstermezdi.
  const { context: opContext, page: opPage } = await freshPage();
  await loginAs(opPage, BASE, OPERATOR, 'owner');
  await opPage.goto(`${BASE}/isletme/rezervasyonlar?gun=${pending.booking.booking_date}`, {
    waitUntil: 'networkidle',
  });
  await opPage.getByRole('button', { name: /Hava nedeniyle günü iptal et/ }).click();
  await opPage.getByRole('button', { name: /Evet, günü iptal et/ }).click();
  await opPage.waitForTimeout(3000);
  await opContext.close();

  const refunds = await store.all('SELECT * FROM refunds WHERE payment_id = ?', [
    pending.payment.id,
  ]);
  check(
    'iade YALNIZCA tahsil edileni geri veriyor — tesiste ödenecek kısım iade edilmiyor',
    refunds.length === 1 && Number(refunds[0].amount_try) === expectedDeposit,
    `${refunds.length} iade, tutar ${refunds[0]?.amount_try}, kapora ${expectedDeposit}`
  );
}

// ---------- 7. Bugün ekranındaki beklenen tahsilat ----------
//
// Rezervasyon BUGÜNE taşınıyor: Bugün ekranı yalnızca bugünü gösteriyor ve
// ekrandaki rakamı sınamanın başka yolu yok.

if (!pending.error) {
  const todaySlot = randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  await store.run(
    `INSERT INTO slots (id, activity_id, slot_date, slot_time, capacity, booked, status, created_at)
     VALUES (?, ?, ?, '23:30', 20, 2, 'open', ?)`,
    [todaySlot, withDeposit.id, today, now]
  );
  await store.run(
    `UPDATE bookings SET slot_id = ?, booking_date = ?, booking_time = '23:30',
       status = 'confirmed', cancelled_at = NULL, cancel_reason = NULL
     WHERE id = ?`,
    [todaySlot, today, pending.booking.id]
  );

  const { context, page } = await freshPage();
  await loginAs(page, BASE, OPERATOR, 'owner');
  await page.goto(`${BASE}/isletme/bugun`, { waitUntil: 'networkidle' });

  // Kutunun METNİ okunuyor, sayfanın tamamı taranmıyor: rakam sayfanın başka
  // bir yerinde de geçebilir ve "sayfada 1.920 var" demek, o rakamın DOĞRU
  // KUTUDA olduğunu göstermez.
  const tile = await page
    .locator('div', { hasText: 'Beklenen tahsilat' })
    .last()
    .innerText();
  const shown = Number(tile.replace(/[^\d]/g, ''));
  const onsite = expectedTotal - expectedDeposit;

  check(
    'Bugün ekranındaki beklenen tahsilat KAPORAYI DÜŞÜYOR',
    shown === onsite,
    `ekran: ${shown}, tesiste ödenecek: ${onsite}, toplam: ${expectedTotal}`
  );
  await context.close();

  // ---------- 8. Bilet ekranı ----------

  const { context: c2, page: p2 } = await freshPage();
  await p2.goto(`${BASE}/bilet/${pending.booking.code}`, { waitUntil: 'networkidle' });
  const ticket = await p2.locator('body').innerText();
  check(
    'bilet ödenen ve tesiste ödenecek tutarı AYRI AYRI gösteriyor',
    /Ödenen kapora/i.test(ticket) && /Tesiste ödenecek/i.test(ticket),
    ticket.includes('kapora') ? 'kapora satırı var' : 'kapora satırı yok'
  );
  await c2.close();
}

// ---------- 9. Oran değişimi geçmişi etkilemiyor ----------

if (!pending.error) {
  await store.run('UPDATE activities SET deposit_percent = 50 WHERE id = ?', [withDeposit.id]);

  const unchanged = await store.get('SELECT deposit_try FROM bookings WHERE id = ?', [
    pending.booking.id,
  ]);
  check(
    'oran %20 → %50 yapılınca GEÇMİŞ rezervasyonun kaporası değişmiyor',
    Number(unchanged.deposit_try) === expectedDeposit,
    `kapora: ${unchanged.deposit_try}, beklenen: ${expectedDeposit}`
  );

  await store.run('UPDATE activities SET deposit_percent = ? WHERE id = ?', [
    DEPOSIT_PERCENT,
    withDeposit.id,
  ]);
}

// ---------- 11. Ödeme sağlayıcısı yoksa kapora yok ----------

{
  const { context, page } = await freshPage();
  const result = await book(page, {
    baseUrl: BASE,
    slug: noProvider.slug,
    name: `Odemesiz Kapora ${tag}`,
    phone: testPhone('5802').display,
    people: 2,
  });

  if (result.code) {
    const row = await store.get(
      'SELECT payment_mode, deposit_try, total_try FROM bookings WHERE code = ?',
      [result.code]
    );
    check(
      'online tahsilat kapalıyken kapora ALINMIYOR ve kayıt kaporalı görünmüyor',
      row.payment_mode !== 'deposit' && Number(row.deposit_try) === 0,
      `kip: ${row?.payment_mode}, kapora: ${row?.deposit_try}`
    );
    check(
      'tutar yine tam kaydediliyor',
      Number(row.total_try) === expectedTotal,
      `${row?.total_try}`
    );
  } else {
    check('online tahsilat kapalıyken kapora ALINMIYOR', false, result.error);
  }
  await context.close();
}

// ---------- 10. Oran doğrulaması ----------

//
// Arayüzden gerçekten kaydedilebiliyor ve geçersiz oran reddediliyor mu.
// Formdaki `min`/`max` işaretleri sökülüp gönderiliyor: sınırın SUNUCUDA
// olduğunu kanıtlamanın tek yolu istemcideki her engeli atlamak.

{
  const { context, page } = await freshPage();
  await loginAs(page, BASE, OPERATOR, 'owner');
  await page.goto(`${BASE}/isletme/aktiviteler/${withDeposit.id}/fiyat`, {
    waitUntil: 'networkidle',
  });

  const field = page.locator('#depositPercent');
  const form = page.locator('form', { has: field });

  async function submitDeposit(value) {
    await page.evaluate(() => {
      const input = document.querySelector('#depositPercent');
      if (!input) return;
      input.removeAttribute('min');
      input.removeAttribute('max');
      input.form?.setAttribute('novalidate', 'novalidate');
    });
    await field.fill(value);
    await form.locator('button[type="submit"]').click();
    await page.waitForTimeout(1200);
    return (await page.locator('[role="alert"]').first().innerText().catch(() => '')).trim();
  }

  const tooLow = await submitDeposit('3');
  const afterLow = await store.get('SELECT deposit_percent FROM activities WHERE id = ?', [
    withDeposit.id,
  ]);
  check(
    '%3 SUNUCUDA reddediliyor (istemcideki sınır sökülmüş olsa da)',
    /%5 ile %80/.test(tooLow) && Number(afterLow.deposit_percent) === DEPOSIT_PERCENT,
    `mesaj: ${tooLow || 'yok'}, kayıtlı oran: ${afterLow?.deposit_percent}`
  );

  const tooHigh = await submitDeposit('90');
  const afterHigh = await store.get('SELECT deposit_percent FROM activities WHERE id = ?', [
    withDeposit.id,
  ]);
  check(
    '%90 reddediliyor — tamamı isteniyorsa kapora değil peşin ödeme söz konusu',
    /%5 ile %80/.test(tooHigh) && Number(afterHigh.deposit_percent) === DEPOSIT_PERCENT,
    `kayıtlı oran: ${afterHigh?.deposit_percent}`
  );

  const valid = await submitDeposit('30');
  const afterValid = await store.get('SELECT deposit_percent FROM activities WHERE id = ?', [
    withDeposit.id,
  ]);
  check(
    'geçerli oran kaydediliyor — kontrol her şeyi engellemiyor',
    Number(afterValid.deposit_percent) === 30,
    `kayıtlı oran: ${afterValid?.deposit_percent}, mesaj: ${valid}`
  );

  const cleared = await submitDeposit('');
  const afterClear = await store.get('SELECT deposit_percent FROM activities WHERE id = ?', [
    withDeposit.id,
  ]);
  check(
    'boş bırakmak kaporayı KAPATIYOR',
    afterClear.deposit_percent === null,
    `kayıtlı oran: ${afterClear?.deposit_percent}, mesaj: ${cleared}`
  );

  await context.close();
}

// Şema kısıtı YENİ kurulumda sınanıyor, çalışan veritabanında değil.
//
// Bu ayrım gerçek ve gizlenmemeli: `deposit_percent` var olan kurulumlara
// `ALTER TABLE ADD COLUMN` ile ekleniyor ve SQLite eklenen sütuna CHECK
// kabul etmiyor (şube ve acente sütunlarında olduğu gibi). Yani sınır ESKİ
// kurulumlarda yalnızca uygulama tarafında var — yukarıdaki %3/%90 testleri
// tam olarak onu kanıtlıyor. Burada sınanan şey, sıfırdan kurulan bir
// veritabanının kısıtı gerçekten taşıdığı.
{
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { readFileSync } = await import('node:fs');
  const { default: Database } = await import('better-sqlite3');

  const dir = mkdtempSync(join(tmpdir(), 'rastla-kapora-'));
  const fresh = new Database(join(dir, 'yeni.db'));

  // Şema dosyası doğrudan okunuyor: `db()` tekil ve bu süreçte zaten açık.
  fresh.exec(readFileSync(new URL('../lib/db/schema.sql', import.meta.url), 'utf8'));

  let rejected = 0;
  for (const bad of [3, 90, 0]) {
    try {
      fresh
        .prepare(
          `INSERT INTO activities (id, operator_id, slug, title, category, price_try,
             duration_minutes, location_name, capacity_mode, status, deposit_percent, created_at)
           VALUES (?, ?, ?, 'Gecersiz', 'jet-ski', 100, 30, 'Sahil', 'per_person', 'draft', ?, ?)`
        )
        .run(randomUUID(), OPERATOR, `kapora-gecersiz-${bad}`, bad, now);
    } catch {
      rejected++;
    }
  }

  // Karşı kontrol: geçerli oran GEÇİYOR. Yoksa üçünün de reddedilmesi
  // yabancı anahtar gibi ilgisiz bir sebepten olabilir ve test doğru sonucu
  // yanlış sebeple verirdi.
  let validAccepted = false;
  try {
    fresh
      .prepare(
        `INSERT INTO operators (id, name, created_at) VALUES (?, 'Kapora Testi', ?)`
      )
      .run(OPERATOR, now);
    fresh
      .prepare(
        `INSERT INTO activities (id, operator_id, slug, title, category, price_try,
           duration_minutes, location_name, capacity_mode, status, deposit_percent, created_at)
         VALUES (?, ?, 'kapora-gecerli', 'Gecerli', 'jet-ski', 100, 30, 'Sahil',
                 'per_person', 'draft', 20, ?)`
      )
      .run(randomUUID(), OPERATOR, now);
    validAccepted = true;
  } catch {
    validAccepted = false;
  }

  fresh.close();
  rmSync(dir, { recursive: true, force: true });

  check(
    'YENİ kurulumda geçersiz kapora oranı (%3, %90, %0) şema tarafından reddediliyor',
    rejected === 3 && validAccepted,
    `${rejected}/3 reddedildi, geçerli oran kabul edildi: ${validAccepted}`
  );
}

await browser.close();

// Temizlik
const ids = [withDeposit.id, noProvider.id];
const slugs = [withDeposit.slug, noProvider.slug];
const idList = ids.map(() => '?').join(',');
const slugList = slugs.map(() => '?').join(',');
const scope = `SELECT id FROM bookings WHERE activity_slug IN (${slugList})`;

await store.run(`DELETE FROM refunds WHERE payment_id IN (
  SELECT id FROM payments WHERE booking_id IN (${scope}))`, slugs);
await store.run(`DELETE FROM payouts WHERE booking_id IN (${scope})`, slugs);
await store.run(`DELETE FROM payments WHERE booking_id IN (${scope})`, slugs);
await store.run(`DELETE FROM bookings WHERE activity_slug IN (${slugList})`, slugs);
await store.run(`DELETE FROM slots WHERE activity_id IN (${idList})`, ids);
await store.run(`DELETE FROM activities WHERE id IN (${idList})`, ids);
await store.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
