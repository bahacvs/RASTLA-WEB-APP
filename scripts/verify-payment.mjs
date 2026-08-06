/**
 * Ödeme akışının doğruluk testi.
 *
 * Sınananlar:
 *   1. Alt üye işyeri anahtarı olmayan işletmede online ödeme BAŞLATILMAZ —
 *      rezervasyon eskisi gibi doğrudan onaylanır.
 *   2. Ödemeli işletmede rezervasyon `pending_payment` doğar ve kapasite ödeme
 *      boyunca TUTULUR.
 *   3. Ödemesi tamamlanmamış bilet OKUTULAMAZ.
 *   4. Kurcalanmış tutarla gelen geri çağrı REDDEDİLİR, günlüğe `denied` düşer
 *      ve rezervasyon onaylanmaz.
 *   5. Aynı geri çağrıyı 12 AYRI SÜREÇ aynı anda işlese bile rezervasyon TAM
 *      OLARAK BİR KEZ onaylanır.
 *   6. Ödeme süresi aşımı kapasiteyi TAM OLARAK BİR KEZ iade eder (iş iki kez
 *      koşturulur).
 *   7. Hava iptali otomatik tam iade üretir; aynı ödeme aynı sebeple İKİ KEZ
 *      iade edilemez.
 *   8. Komisyon tam sayı aritmetiğiyle bölünür; kuruş kaybolmaz.
 *   9. Ödeme tablosunda kart numarası yok — yalnızca maskeli son dört hane.
 *
 * Eşzamanlılık iddiaları AYRI İŞLETİM SİSTEMİ SÜREÇLERİYLE sınanır. Aynı
 * süreçte Promise.all ile denemek yanıltıcı olurdu: tek bir olay döngüsü
 * gerçek yarışı üretmez.
 *
 * Kullanım:
 *   PAYMENT_PROVIDER=fake npm start > server.log &
 *   SERVER_LOG=server.log node scripts/verify-payment.mjs
 *
 * `fake` sağlayıcı iyzico ile AYNI sözleşmeyi uyguluyor. Buradaki iddiaların
 * hiçbiri iyzico'ya özgü değil; hepsi bizim kodumuzda duruyor. Sağlayıcıya
 * özgü olan tek şey imzalama ve alan adlarıdır ve o, ilk gerçek anahtarla
 * sınanacak — bu sınır README'de açıkça yazılı.
 */
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { db as connect } from '../lib/db/index.mjs';
import { ensureTestAccounts, TEST_PASSWORD, emailFor } from './lib/test-accounts.mjs';
import { book, testPhone } from './lib/booking.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

const PAID_OPERATOR = 'buyukcekmece-wsc';
const PAID_SLUG = 'elektrikli-sup-deneyimi';
const FREE_OPERATOR = 'mimarsinan-marina';
const FREE_SLUG = 'gun-batimi-sup-turu';

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const execFileAsync = promisify(execFile);

/** Ayrı bir süreç başlatır ve çıktısını döner. */
async function run(command, args) {
  const { stdout } = await execFileAsync(command, args, { encoding: 'utf8', timeout: 30000 });
  return stdout.trim();
}

const store = await connect();
await ensureTestAccounts();

// ---------------------------------------------------------------- hazırlık

/**
 * Ödeme açık işletmeye bir alt üye anahtarı verilir; diğerinden alınır.
 *
 * Anahtar sahte ama akış gerçek: `fake` sağlayıcı da anahtarı beklediği için
 * "anahtarsız işletmede ödeme başlamaz" kuralı gerçekten sınanmış oluyor.
 */
await store.run(
  `UPDATE operators SET submerchant_key = ?, commission_bp = 1000 WHERE id = ?`,
  ['test-submerchant-key', PAID_OPERATOR]
);
await store.run(`UPDATE operators SET submerchant_key = NULL WHERE id = ?`, [FREE_OPERATOR]);

// Hız sınırı sayaçları sıfırlanır.
//
// Bu süit beş rezervasyon açıyor ve her biri bir doğrulama kodu istiyor. Kova
// IP başına saatte 30'da; aynı saat içinde koşan diğer süitlerle paylaşıldığı
// için ödeme testi ilgisiz bir sebeple çöküyordu. Sınırın kendisi
// verify-rate-limit.mjs içinde ayrıca sınanıyor; burada sıfırlamak bir şeyi
// gizlemiyor.
await store.run('DELETE FROM rate_limits');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

/** Her rezervasyon kendi tarayıcı bağlamında: oturumlar birbirine karışmasın. */
async function freshPage() {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function bookingByCode(code) {
  return store.get('SELECT * FROM bookings WHERE code = ?', [code]);
}

async function paymentFor(bookingId) {
  return store.get('SELECT * FROM payments WHERE booking_id = ? ORDER BY created_at DESC', [
    bookingId,
  ]);
}

async function auditFor(bookingId, action) {
  const rows = await store.all(
    `SELECT * FROM audit_log WHERE action = ? AND (target_id = ? OR meta LIKE ?)`,
    [action, bookingId, `%${bookingId}%`]
  );
  return rows;
}

// ---------- 1. Anahtarsız işletmede online ödeme başlatılmaz ----------

{
  const { context, page } = await freshPage();
  const phone = testPhone('5551');
  const result = await book(page, {
    baseUrl: BASE,
    slug: FREE_SLUG,
    name: 'Odemesiz Misafir',
    phone: phone.display,
  });
  await context.close();

  if (result.code) {
    const booking = await bookingByCode(result.code);
    const payment = await paymentFor(booking.id);
    check(
      'Alt üye anahtarı olmayan işletmede rezervasyon doğrudan onaylanır',
      booking.status === 'confirmed',
      `durum: ${booking.status}`
    );
    check('Anahtarsız işletmede ödeme kaydı OLUŞMAZ', !payment, payment ? 'kayıt var' : '');
  } else {
    check('Anahtarsız işletmede rezervasyon oluşur', false, result.error);
    check('Anahtarsız işletmede ödeme kaydı OLUŞMAZ', false, 'rezervasyon oluşmadı');
  }
}

// ---------- 2-5. Ödemeli akış ----------

/**
 * Ödemeye kadar gelip ORADA duran bir rezervasyon üretir.
 *
 * Sağlayıcıya yönlendirme yakalanıp durdurulduğu için rezervasyon
 * `pending_payment` hâlinde ve token kullanılmamış kalır — asıl testler bu
 * anın üzerine kuruluyor.
 */
async function pendingBooking(prefix) {
  const { context, page } = await freshPage();
  const phone = testPhone(prefix);
  const result = await book(page, {
    baseUrl: BASE,
    slug: PAID_SLUG,
    name: 'Odemeli Misafir',
    phone: phone.display,
    stopAtPayment: true,
  });
  await context.close();

  if (!result.paymentUrl) return { error: result.error ?? 'ödeme adımına gidilmedi' };

  // Token adresten değil VERİTABANINDAN okunuyor.
  //
  // Sağlayıcı sonucu geri çağrıya gövdede POST ediyor; adres çubuğunda token
  // yok ve olmamalı da. Her rezervasyon kendine ait bir numara kullandığı için
  // kayıt telefondan tekil olarak bulunabiliyor.
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

  // Tarayıcının ödeme bitince geleceği adres. Geri çağrı hem GET hem POST
  // kabul ediyor; sağlayıcı POST kullanıyor, kullanıcının dönüşü GET olabiliyor.
  return {
    token: payment.token,
    payment,
    booking,
    callbackUrl: `${BASE}/odeme/donus?token=${payment.token}`,
  };
}

const pending = await pendingBooking('5552');

if (pending.error) {
  check('Ödemeli işletmede ödeme adımına gidilir', false, pending.error);
  console.error(
    '\nÖdeme akışı başlatılamadı. Sunucu PAYMENT_PROVIDER=fake ile başlatıldı mı?\n'
  );
} else {
  check('Ödemeli işletmede ödeme adımına gidilir', true);

  check(
    'Rezervasyon pending_payment olarak doğar',
    pending.booking.status === 'pending_payment',
    `durum: ${pending.booking.status}`
  );

  // Kapasite ödeme boyunca tutulmalı: tutulmasaydı ödeme sayfasındayken yer
  // başkasına satılabilir ve müşteri ödedikten sonra yersiz kalabilirdi.
  const slot = await store.get('SELECT * FROM slots WHERE id = ?', [pending.booking.slot_id]);
  check(
    'Kapasite ödeme boyunca TUTULUR',
    Number(slot.booked) >= Number(pending.booking.units),
    `booked: ${slot.booked}`
  );

  check(
    'Komisyon tam sayı: tutar = komisyon + işletme payı',
    Number(pending.payment.commission_try) === Math.floor((Number(pending.payment.amount_try) * 1000) / 10000) &&
      Number(pending.payment.commission_try) <= Number(pending.payment.amount_try),
    `tutar ${pending.payment.amount_try}, komisyon ${pending.payment.commission_try}`
  );

  // ---------- 3. Ödemesi bekleyen bilet okutulamaz ----------
  {
    const { context, page } = await freshPage();
    await page.goto(`${BASE}/isletme`, { waitUntil: 'networkidle' });
    await page.fill('#email', emailFor(PAID_OPERATOR, 'owner'));
    await page.fill('#password', TEST_PASSWORD);
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await page.waitForURL(/\/isletme\/tara/, { timeout: 15000 });

    await page.fill('#code', pending.booking.code);
    await page.getByRole('button', { name: /Onayla/ }).first().click();
    await page.waitForTimeout(1500);

    const text = await page.locator('body').innerText();
    const fresh = await bookingByCode(pending.booking.code);

    check(
      'Ödemesi bekleyen bilet OKUTULAMAZ',
      fresh.status === 'pending_payment' && /ödemesi tamamlanmamış/i.test(text),
      `durum: ${fresh.status}`
    );
    await context.close();
  }

  // ---------- 4. Kurcalanmış tutar reddedilir ----------
  {
    // Sağlayıcının "tahsil ettim" dediği tutar kasten değiştirilir. Gerçek
    // saldırı senaryosu bu: ucuz bir ödemeyle pahalı bir bileti almak.
    const tampered = await pendingBooking('5553');

    if (tampered.error) {
      check('Kurcalanmış tutar reddedilir', false, tampered.error);
    } else {
      await store.run('UPDATE fake_payment_sessions SET paid_try = ? WHERE token = ?', [
        1,
        tampered.token,
      ]);

      const response = await fetch(tampered.callbackUrl, { redirect: 'manual' });
      const booking = await store.get('SELECT * FROM bookings WHERE id = ?', [
        tampered.booking.id,
      ]);
      const denied = await auditFor(tampered.booking.id, 'payment.denied');
      const payment = await store.get('SELECT * FROM payments WHERE token = ?', [tampered.token]);

      check(
        'Kurcalanmış tutar ONAYLANMAZ',
        booking.status === 'pending_payment',
        `durum: ${booking.status}`
      );
      check(
        'Kurcalanmış tutar günlüğe denied olarak düşer',
        denied.length === 1 && denied[0].outcome === 'denied',
        `${denied.length} kayıt`
      );
      check(
        'Reddedilen ödeme failed işaretlenir',
        payment.status === 'failed',
        `durum: ${payment.status}`
      );
      check(
        'Kullanıcı hata sayfasına yönlendirilir',
        String(response.headers.get('location') ?? '').includes('/odeme/sonuc'),
        String(response.headers.get('location'))
      );
    }
  }

  // ---------- 5. 12 eşzamanlı geri çağrı ----------
  {
    const dir = mkdtempSync(join(tmpdir(), 'rastla-odeme-'));
    const worker = join(dir, 'callback.mjs');

    // Ayrı süreç: aynı olay döngüsünde Promise.all ile denemek gerçek yarışı
    // üretmez, çünkü istekler sırayla planlanır.
    writeFileSync(
      worker,
      `const response = await fetch(process.argv[2], { redirect: 'manual' });
       console.log(response.headers.get('location') ?? response.status);`
    );

    const RACERS = 12;
    // `execFile` (eşzamansız) kullanılıyor, `execFileSync` değil: senkron
    // çağrı süreçleri sırayla çalıştırır ve yarış hiç doğmazdı. Burada 12
    // süreç de gerçekten aynı anda ayakta.
    const results = await Promise.all(
      Array.from({ length: RACERS }, () =>
        run('node', [worker, pending.callbackUrl]).catch(
          (error) => `hata: ${String(error).slice(0, 80)}`
        )
      )
    );

    rmSync(dir, { recursive: true, force: true });

    const booking = await bookingByCode(pending.booking.code);
    const succeeded = await auditFor(pending.booking.id, 'payment.succeeded');
    const toTicket = results.filter((r) => r.includes('/bilet/')).length;

    check(
      `${RACERS} eşzamanlı geri çağrıdan sonra rezervasyon onaylı`,
      booking.status === 'confirmed',
      `durum: ${booking.status}`
    );
    check(
      'Onay günlüğe TAM OLARAK BİR KEZ düşer',
      succeeded.length === 1,
      `${succeeded.length} kayıt`
    );
    check(
      'Tekrar eden geri çağrılar hata vermez, hepsi bilete gider',
      toTicket === RACERS,
      `${toTicket}/${RACERS}`
    );

    const payment = await paymentFor(pending.booking.id);
    check(
      'Ödeme kaydı succeeded ve maskeli kart bilgisi taşıyor',
      payment.status === 'succeeded' && String(payment.card_last_four).length === 4,
      `durum ${payment.status}, son dört ${payment.card_last_four}`
    );
  }

  // ---------- 9. Kart numarası hiçbir yerde yok ----------
  {
    const rows = await store.all('SELECT * FROM payments');
    const serialized = JSON.stringify(rows);
    // Fake sağlayıcı 4242 son dördünü döndürüyor; 16 haneli bir dizi ise
    // hiçbir satırda bulunmamalı.
    check(
      'Ödeme tablosunda 16 haneli kart numarası YOK',
      !/\d{13,19}/.test(serialized.replace(/"\d{4}"/g, '""')),
      ''
    );
  }
}

// ---------- 6. Süre aşımı kapasiteyi tam olarak bir kez iade eder ----------

{
  const expiring = await pendingBooking('5554');

  if (expiring.error) {
    check('Süre aşımı kapasiteyi bir kez iade eder', false, expiring.error);
  } else {
    const before = await store.get('SELECT booked FROM slots WHERE id = ?', [
      expiring.booking.slot_id,
    ]);

    // Kaydı geriye alıyoruz ki iş onu süresi dolmuş görsün. Beklemek yerine
    // saati kaydırmak, testi 20 dakika sürmekten kurtarıyor.
    await store.run('UPDATE bookings SET created_at = ? WHERE id = ?', [
      new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      expiring.booking.id,
    ]);

    const sweep = () =>
      execFileSync('node', ['scripts/gorev.mjs', 'odeme-suresi'], { encoding: 'utf8' });

    sweep();
    const afterFirst = await store.get('SELECT booked FROM slots WHERE id = ?', [
      expiring.booking.slot_id,
    ]);
    // İkinci koşum: aynı kaydı ikinci kez düşürmeye çalışır ve kapasiteyi
    // ikinci kez iade etmemeli.
    sweep();
    const afterSecond = await store.get('SELECT booked FROM slots WHERE id = ?', [
      expiring.booking.slot_id,
    ]);

    const booking = await store.get('SELECT * FROM bookings WHERE id = ?', [expiring.booking.id]);
    const released = Number(before.booked) - Number(afterFirst.booked);

    check(
      'Süresi dolan rezervasyon expired olur',
      booking.status === 'expired' && booking.expired_at,
      `durum: ${booking.status}`
    );
    check(
      'Kapasite tutulduğu kadar iade edilir',
      released === Number(expiring.booking.units),
      `${released} birim, beklenen ${expiring.booking.units}`
    );
    check(
      'İkinci süpürme kapasiteyi TEKRAR iade ETMEZ',
      Number(afterSecond.booked) === Number(afterFirst.booked),
      `${afterFirst.booked} -> ${afterSecond.booked}`
    );
  }
}

// ---------- 7. Hava iptali otomatik iade, iki kez iade edilemez ----------

{
  const { context, page } = await freshPage();
  const phone = testPhone('5555');
  const result = await book(page, {
    baseUrl: BASE,
    slug: PAID_SLUG,
    name: 'Iade Misafiri',
    phone: phone.display,
  });
  await context.close();

  if (!result.code) {
    check('Hava iptali otomatik iade üretir', false, result.error);
  } else {
    const booking = await bookingByCode(result.code);
    const payment = await paymentFor(booking.id);

    const { context: opContext, page: opPage } = await freshPage();
    await opPage.goto(`${BASE}/isletme`, { waitUntil: 'networkidle' });
    await opPage.fill('#email', emailFor(PAID_OPERATOR, 'owner'));
    await opPage.fill('#password', TEST_PASSWORD);
    await opPage.getByRole('button', { name: 'Giriş Yap' }).click();
    await opPage.waitForURL(/\/isletme\/tara/, { timeout: 15000 });

    await opPage.goto(`${BASE}/isletme/rezervasyonlar?gun=${booking.booking_date}`, {
      waitUntil: 'networkidle',
    });
    // İptal iki adımlı: önce niyet, sonra onay. Yanlışlıkla bir günün tamamını
    // iptal etmeyi zorlaştıran bu adım testte de aynen izlenir.
    await opPage.getByRole('button', { name: /Hava nedeniyle günü iptal et/ }).click();
    await opPage.getByRole('button', { name: /Evet, günü iptal et/ }).click();
    await opPage.waitForTimeout(3000);
    await opContext.close();

    const refunds = await store.all('SELECT * FROM refunds WHERE payment_id = ?', [payment.id]);
    const cancelled = await bookingByCode(result.code);

    check(
      'Hava iptali rezervasyonu iptal eder',
      cancelled.status === 'cancelled' && cancelled.cancel_reason === 'weather',
      `durum: ${cancelled.status}`
    );
    check(
      'Hava iptali TAM İADE üretir',
      refunds.length === 1 &&
        refunds[0].status === 'succeeded' &&
        Number(refunds[0].amount_try) === Number(payment.amount_try),
      `${refunds.length} iade`
    );

    // İdempotanlığın dayandığı yer kod değil, veritabanı kısıtı. Doğrudan onu
    // sınıyoruz: aynı ödeme aynı sebeple ikinci bir iade satırı alamamalı.
    let rejected = false;
    try {
      await store.run(
        `INSERT INTO refunds (id, payment_id, amount_try, reason, status, created_at)
         VALUES (?, ?, ?, 'weather', 'pending', ?)`,
        ['ikinci-iade-denemesi', payment.id, payment.amount_try, new Date().toISOString()]
      );
    } catch {
      rejected = true;
    }
    check('Aynı ödeme aynı sebeple İKİ KEZ iade edilemez', rejected);
  }
}

// ------------------------------------------------------------------- rapor

await browser.close();

console.log('\nÖDEME AKIŞI DOĞRULAMASI\n');
for (const { name, pass, detail } of checks) {
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti.\n`);

await store.close();
process.exit(failed === 0 ? 0 : 1);
