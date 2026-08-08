/**
 * RASTLA operasyon panelinin testi.
 *
 * Bu panel ticari sonuç doğuran kararlar veriyor: rozet, komisyon oranı,
 * paranın durdurulması. Dolayısıyla sınanması gereken iki şey var —
 * **kimin giremediği** ve **kararın gerçekten uygulandığı.**
 *
 * Sınananlar:
 *   1. İşletme oturumu yönetim paneline GİRMİYOR. İki oturum ayrı çerezde ve
 *      biri diğerinin yerine geçmiyor.
 *   2. Oturumsuz erişim girişe düşüyor.
 *   3. `reviewer` işletme doğrulayabiliyor ama komisyona ve hak edişe
 *      DOKUNAMIYOR — arayüzde değil, SUNUCU EYLEMİNDE.
 *   4. Doğrulama rozeti gerçekten duruma bağlı: doğrulanmamış işletmenin
 *      ilan sayfasında rozet YOK, doğrulanınca çıkıyor.
 *   5. Doğrulanmamış işletmenin ilanı yayına verildiğinde İNCELEMEYE düşüyor
 *      ve müşteriye görünmüyor; onaylanınca yayına giriyor.
 *   6. Hak edişi durdurulmuş işletmede bilet okutmak payı serbest BIRAKMIYOR;
 *      rezervasyon ve check-in çalışmaya devam ediyor.
 *   7. Askıya alınan platform hesabının elindeki çerez anında geçersiz.
 *
 * Kullanım:
 *   PAYMENT_PROVIDER=fake npm start > server.log &
 *   SERVER_LOG=server.log node scripts/verify-platform.mjs
 */
import { chromium } from 'playwright';
import { db as connect } from '../lib/db/index.mjs';
import {
  ensureTestAccounts,
  ensurePlatformAccounts,
  loginAs,
  loginAsPlatform,
  platformEmailFor,
} from './lib/test-accounts.mjs';
import { book, testPhone } from './lib/booking.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const OPERATOR = 'mimarsinan-marina';
const PAID_OPERATOR = 'buyukcekmece-wsc';
const PAID_SLUG = 'elektrikli-sup-deneyimi';

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const store = await connect();
await ensureTestAccounts();
await ensurePlatformAccounts();
await store.run('DELETE FROM rate_limits');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

async function freshPage() {
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  return { context, page: await context.newPage() };
}

const pathOf = (page) => new URL(page.url()).pathname;

// ---------- 1-2. İki oturum birbirinin yerine geçmiyor ----------

{
  const { context, page } = await freshPage();
  await page.goto(`${BASE}/yonetim/isletmeler`, { waitUntil: 'networkidle' });
  check('oturumsuz erişim girişe düşüyor', pathOf(page) === '/yonetim', page.url());
  await context.close();
}

{
  // İşletme sahibi giriş yapıyor ve yönetim paneline gitmeyi deniyor.
  // Yetkisi olan bir hesap ama BAŞKA BİR ALANDA; çerezi burada hiçbir şey
  // ifade etmemeli.
  const { context, page } = await freshPage();
  await loginAs(page, BASE, PAID_OPERATOR, 'owner');
  await page.goto(`${BASE}/yonetim/isletmeler`, { waitUntil: 'networkidle' });
  check(
    'işletme oturumu yönetim paneline GİRMİYOR',
    pathOf(page) === '/yonetim',
    page.url()
  );
  await context.close();
}

// ---------- 3. İnceleme rolü paraya dokunamıyor ----------

{
  const { context, page } = await freshPage();
  await loginAsPlatform(page, BASE, 'reviewer');

  const body = await page.locator('body').innerText();
  check('inceleme rolü işletme listesini görüyor', /İşletmeler/.test(body));
  check(
    'inceleme rolüne komisyon alanı GÖSTERİLMİYOR',
    (await page.locator('text=Oranı Kaydet').count()) === 0
  );
  check(
    'inceleme rolüne hak ediş durdurma GÖSTERİLMİYOR',
    (await page.locator('text=Hak edişi durdur').count()) === 0
  );

  await context.close();
}

// ---------- 3b. Asıl kontrol: SUNUCU EYLEMİ ----------
//
// Düğmeyi gizlemek yetkilendirme değil. Ama sunucu eylemini dışarıdan
// çağırmak da göründüğü kadar kolay değil: Next.js eylemi derleme anında
// üretilen bir kimlikle çağırıyor ve uydurma bir kimlik 404 alıyor —
// yani yetki kontrolüne HİÇ ULAŞMIYOR. Öyle bir test, kontrol tamamen
// kaldırılsa bile geçerdi.
//
// Bu yüzden yol şu: hesap YÖNETİCİYKEN sayfa açılıyor (form gerçek eylem
// kimliğiyle çiziliyor), sonra hesabın rolü incelemeye düşürülüyor ve
// düğmeye basılıyor. İstek gerçek eylemi, gerçek kimlikle çağırıyor;
// sunucu tarafında ise artık yetkisiz bir kullanıcı var. Sahadaki karşılığı
// da bu: sayfası açık dururken yetkisi kısılan kişi.

{
  const { context, page } = await freshPage();
  await loginAsPlatform(page, BASE, 'admin');

  const before = await store.get('SELECT commission_bp FROM operators WHERE id = ?', [OPERATOR]);

  const row = page.locator('li').filter({ hasText: OPERATOR }).first();
  const field = row.locator('input[name="percent"]');
  await field.fill('1');

  // Sayfa çizildikten SONRA yetki düşürülüyor.
  await store.run(`UPDATE platform_users SET role = 'reviewer' WHERE email = ?`, [
    platformEmailFor('admin'),
  ]);

  await row.getByRole('button', { name: 'Oranı Kaydet' }).click();
  await page.waitForTimeout(2000);

  const after = await store.get('SELECT commission_bp FROM operators WHERE id = ?', [OPERATOR]);
  const shown = await page.locator('body').innerText();

  check(
    'yetkisi kısılan kullanıcı GERÇEK sunucu eylemiyle de komisyon değiştiremiyor',
    Number(before.commission_bp) === Number(after.commission_bp),
    `${before.commission_bp} -> ${after.commission_bp}`
  );
  check(
    'sunucu reddi kullanıcıya söyleniyor',
    /yetkiniz yok/i.test(shown),
    shown.match(/.{0,40}yetkiniz yok.{0,20}/i)?.[0] ?? 'mesaj yok'
  );

  await context.close();
  await store.run(`UPDATE platform_users SET role = 'admin' WHERE email = ?`, [
    platformEmailFor('admin'),
  ]);
}

// ---------- 4-5. Rozet ve ilan incelemesi ----------

// İşletme doğrulanmamış duruma çekiliyor; testin başlangıç noktası bu.
//
// Bu adım DOĞRUDAN SQL ile yapılmıyor, panelden yapılıyor. Sebebi somut: ilan
// sayfası `revalidate = 60` ile önbelleklenmiş bir sayfa ve sorgu dizgisi onu
// kırmıyor (denendi — kırmıyor). Rozetin kaybolması, panelin `revalidatePath`
// çağrısına bağlı. SQL ile kestirmeden gidilseydi test bir dakika boyunca eski
// sayfayı okur ve "rozet gösteriliyor" diye yanlış bir sonuç verirdi — nitekim
// ilk koşuda tam olarak bu oldu. Böylece önbellek tazelemesi de sınanmış oluyor.
await store.run(`UPDATE operators SET payouts_suspended = 0 WHERE id = ?`, [OPERATOR]);

{
  const { context, page } = await freshPage();
  await loginAsPlatform(page, BASE, 'admin');
  const row = page.locator('li').filter({ hasText: OPERATOR }).first();
  await row.locator('select[name="status"]').selectOption('inceleniyor');
  // exact: true — Playwright ad eşleşmesi varsayılan olarak ALT DİZGİ arıyor
  // ve 'Kaydet', yöneticiye gösterilen 'Oranı Kaydet' düğmesiyle de eşleşiyor.
  await row.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.waitForTimeout(2000);
  await context.close();
}

const reset = await store.get('SELECT verification_status FROM operators WHERE id = ?', [OPERATOR]);
check(
  'doğrulama geri alınabiliyor',
  reset.verification_status === 'inceleniyor',
  reset.verification_status
);

const activity = await store.get(
  `SELECT id, slug FROM activities WHERE operator_id = ? AND status = 'published' LIMIT 1`,
  [OPERATOR]
);

{
  const { context, page } = await freshPage();
  // Sorgu dizgisi ÖNBELLEK KIRMAK için: ilan sayfası `revalidate = 60` ile
  // çalışıyor ve önceki koşudan kalan (işletmenin doğrulanmış olduğu) sürüm
  // servis edilebiliyor. Kırılmasaydı test, kodun değil önbelleğin durumunu
  // ölçerdi — nitekim ilk koşuda tam olarak bu oldu.
  await page.goto(`${BASE}/aktivite/${activity.slug}?t=${Date.now()}`, {
    waitUntil: 'networkidle',
  });
  const badges = await page.locator('span.sr-only', { hasText: 'Doğrulanmış işletme' }).count();
  check('doğrulanmamış işletmenin ilanında rozet YOK', badges === 0, `${badges} rozet`);
  await context.close();
}

// İlanı taslağa çekip yeniden yayına vermek: doğrulanmamış işletmede
// incelemeye düşmeli.
await store.run(`UPDATE activities SET status = 'draft' WHERE id = ?`, [activity.id]);

{
  const { context, page } = await freshPage();
  await loginAs(page, BASE, OPERATOR, 'owner');
  await page.goto(`${BASE}/isletme/aktiviteler`, { waitUntil: 'networkidle' });
  const row = page.locator('li').filter({ hasText: 'Yayına Al' }).first();
  await row.getByRole('button', { name: 'Yayına Al' }).click();
  await page.waitForTimeout(2000);
  await context.close();
}

const afterPublish = await store.get('SELECT status FROM activities WHERE id = ?', [activity.id]);
check(
  'doğrulanmamış işletmenin ilanı İNCELEMEYE düşüyor',
  afterPublish.status === 'pending_review',
  afterPublish.status
);

{
  const { context, page } = await freshPage();
  await page.goto(`${BASE}/ara`, { waitUntil: 'networkidle' });
  const found = await page.locator(`a[href="/aktivite/${activity.slug}"]`).count();
  check('incelemedeki ilan müşteriye GÖRÜNMÜYOR', found === 0, `${found} sonuç`);
  await context.close();
}

{
  const { context, page } = await freshPage();
  await loginAsPlatform(page, BASE, 'reviewer');
  await page.goto(`${BASE}/yonetim/ilanlar`, { waitUntil: 'networkidle' });

  const queued = await page.locator('button', { hasText: 'Onayla ve yayına al' }).count();
  check('ilan inceleme kuyruğunda görünüyor', queued >= 1, `${queued} ilan`);

  if (queued >= 1) {
    await page.locator('button', { hasText: 'Onayla ve yayına al' }).first().click();
    await page.waitForTimeout(2000);
  }
  await context.close();
}

const afterApprove = await store.get('SELECT status FROM activities WHERE id = ?', [activity.id]);
check(
  'onaylanan ilan yayına giriyor',
  afterApprove.status === 'published',
  afterApprove.status
);

// Doğrulama veriliyor; rozet çıkmalı.
{
  const { context, page } = await freshPage();
  await loginAsPlatform(page, BASE, 'reviewer');
  const row = page.locator('li').filter({ hasText: OPERATOR }).first();
  await row.locator('select[name="status"]').selectOption('dogrulandi');
  // exact: true — Playwright ad eşleşmesi varsayılan olarak ALT DİZGİ arıyor
  // ve 'Kaydet', yöneticiye gösterilen 'Oranı Kaydet' düğmesiyle de eşleşiyor.
  await row.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.waitForTimeout(2000);
  await context.close();
}

const verified = await store.get(
  'SELECT verification_status, verified_at FROM operators WHERE id = ?',
  [OPERATOR]
);
check(
  'inceleme rolü işletmeyi doğrulayabiliyor',
  verified.verification_status === 'dogrulandi',
  verified.verification_status
);
check('doğrulama tarihi kayda geçiyor', Boolean(verified.verified_at), verified.verified_at ?? 'yok');

{
  const { context, page } = await freshPage();
  // Sayfa 60 saniye önbellekli; sunucu eylemi revalidate ediyor ama testin
  // bunu beklememesi için taze bir istek zorlanıyor.
  await page.goto(`${BASE}/aktivite/${activity.slug}?t=${Date.now()}`, {
    waitUntil: 'networkidle',
  });
  const badges = await page.locator('span.sr-only', { hasText: 'Doğrulanmış işletme' }).count();
  check('doğrulanan işletmenin ilanında rozet ÇIKIYOR', badges === 1, `${badges} rozet`);
  await context.close();
}

// ---------- 6. Hak ediş durdurma ----------

{
  // Ödemeli işletmede bir rezervasyon açılıp ödeniyor, sonra hak ediş
  // durduruluyor ve bilet okutuluyor.
  await store.run(
    `UPDATE operators SET submerchant_key = 'test-submerchant-key' WHERE id = ?`,
    [PAID_OPERATOR]
  );

  const { context, page } = await freshPage();
  const phone = testPhone('5581');
  const result = await book(page, {
    baseUrl: BASE,
    slug: PAID_SLUG,
    name: 'Durdurulmus Hakedis',
    phone: phone.display,
    stopAtPayment: true,
  });
  await context.close();

  if (!result.paymentUrl) {
    check('durdurma senaryosu için ödeme başlatılabiliyor', false, result.error);
  } else {
    check('durdurma senaryosu için ödeme başlatılabiliyor', true);

    const payment = await store.get(
      `SELECT p.* FROM payments p JOIN bookings b ON b.id = p.booking_id
         JOIN users u ON u.id = b.user_id
        WHERE u.phone = ? ORDER BY p.created_at DESC`,
      [phone.normalized]
    );
    await fetch(`${BASE}/odeme/donus?token=${payment.token}`, { redirect: 'manual' });

    const booking = await store.get('SELECT * FROM bookings WHERE id = ?', [payment.booking_id]);
    const held = await store.get('SELECT * FROM payouts WHERE booking_id = ?', [booking.id]);
    check('hak ediş bloke doğdu', held?.status === 'held', held?.status ?? 'kayıt yok');

    // RASTLA hak edişi durduruyor — panelden, gerçek yoldan.
    {
      const { context: adminContext, page: adminPage } = await freshPage();
      await loginAsPlatform(adminPage, BASE, 'admin');
      const row = adminPage.locator('li').filter({ hasText: PAID_OPERATOR }).first();
      await row.getByRole('button', { name: 'Hak edişi durdur' }).click();
      await adminPage.waitForTimeout(2000);
      await adminContext.close();
    }

    const suspended = await store.get(
      'SELECT payouts_suspended FROM operators WHERE id = ?',
      [PAID_OPERATOR]
    );
    check(
      'yönetici hak edişi durdurabiliyor',
      Number(suspended.payouts_suspended) === 1,
      String(suspended.payouts_suspended)
    );

    // Bilet okutuluyor: check-in ÇALIŞMALI, hak ediş SERBEST BIRAKILMAMALI.
    {
      const { context: opContext, page: opPage } = await freshPage();
      await loginAs(opPage, BASE, PAID_OPERATOR, 'owner');
      await opPage.goto(`${BASE}/isletme/tara`, { waitUntil: 'networkidle' });
      await opPage.fill('#code', booking.code);
      await opPage.getByRole('button', { name: /Onayla/ }).first().click();
      await opPage.waitForTimeout(2000);
      await opContext.close();
    }

    const redeemed = await store.get('SELECT status FROM bookings WHERE id = ?', [booking.id]);
    check(
      'durdurma bilet okutmayı ENGELLEMİYOR — müşteri mağdur olmuyor',
      redeemed.status === 'redeemed',
      redeemed.status
    );

    const payout = await store.get('SELECT * FROM payouts WHERE booking_id = ?', [booking.id]);
    check(
      'durdurulmuş işletmede pay SERBEST BIRAKILMIYOR',
      payout.status === 'held',
      payout.status
    );
    check(
      'sebep deftere yazılıyor',
      /durduruldu/.test(payout.failure_reason ?? ''),
      payout.failure_reason ?? 'yok'
    );

    const approvals = await store.all(
      'SELECT action FROM fake_item_approvals WHERE item_ref = ?',
      [payment.item_transaction_ref]
    );
    check(
      'sağlayıcıya onay çağrısı GİTMİYOR',
      approvals.length === 0,
      approvals.map((a) => a.action).join(',') || 'çağrı yok'
    );

    // Durdurma kaldırılınca aynı bilet için hak ediş serbest bırakılabilmeli.
    await store.run(`UPDATE operators SET payouts_suspended = 0 WHERE id = ?`, [PAID_OPERATOR]);
  }
}

// ---------- 7. Askıya alınan hesabın çerezi anında geçersiz ----------

{
  const { context, page } = await freshPage();
  await loginAsPlatform(page, BASE, 'admin');

  await store.run(`UPDATE platform_users SET status = 'suspended' WHERE email = ?`, [
    platformEmailFor('admin'),
  ]);

  await page.goto(`${BASE}/yonetim/isletmeler`, { waitUntil: 'networkidle' });
  check(
    'askıya alınan platform hesabının çerezi ANINDA geçersiz',
    pathOf(page) === '/yonetim',
    page.url()
  );
  await context.close();

  await store.run(`UPDATE platform_users SET status = 'active' WHERE email = ?`, [
    platformEmailFor('admin'),
  ]);
}

await browser.close();
await store.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
