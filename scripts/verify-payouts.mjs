/**
 * Hak ediş defterinin testi.
 *
 * Ürünün ticari çekirdeği burada: müşteri ödedi diye işletme kazanmış olmuyor.
 * Kazanç **hizmetin verilmesiyle** doğuyor. Aradaki fark gelmeyen müşteride
 * ortaya çıkıyor ve yanlış tarafa düşerse ya işletmeye hak etmediği para
 * aktarılır ya da hak ettiği para bloke kalır.
 *
 * Sınananlar:
 *   1. Ödeme onaylanınca hak ediş `held` doğuyor; komisyon ödeme anındaki
 *      oranla donuyor.
 *   2. Aynı rezervasyon için İKİNCİ bir hak ediş satırı açılamıyor (tekrarlanan
 *      geri çağrı).
 *   3. **12 AYRI SÜREÇ aynı anda serbest bırakmayı denese de tam olarak biri
 *      geçiyor** — sağlayıcıya tek onay çağrısı gidiyor.
 *   4. Serbest bırakılmış hak ediş ikinci kez bırakılamıyor ve geri
 *      çevrilemiyor.
 *   5. Bilet okutulunca defter `released` oluyor ve sağlayıcıya `approve`
 *      gidiyor (uçtan uca, gerçek kod yolundan).
 *   6. Müşteri gelmediğinde `reversed` oluyor ve `disapprove` gidiyor.
 *   7. İade defteri düşürüyor; net tutar negatife inmiyor.
 *
 * Eşzamanlılık iddiaları AYRI İŞLETİM SİSTEMİ SÜREÇLERİYLE sınanıyor. Aynı
 * süreçte Promise.all yanıltıcı olurdu: tek olay döngüsü gerçek yarış üretmez.
 *
 * **Bilinen sınır:** iyzico'nun onay ucu gerçek anahtar olmadan çağrılamıyor.
 * Buradaki iddiaların hiçbiri iyzico'ya özgü değil — hepsi bizim durum
 * makinemizde. `fake` sağlayıcı AYNI sözleşmeyi uyguluyor ve çağrıları
 * kaydediyor; sağlayıcıya özgü olan yalnızca uç adresi ve alan adları.
 *
 * Kullanım:
 *   PAYMENT_PROVIDER=fake npm start > server.log &
 *   SERVER_LOG=server.log node scripts/verify-payouts.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { db as connect } from '../lib/db/index.mjs';
import { ensureTestAccounts, loginAs } from './lib/test-accounts.mjs';
import { book, testPhone } from './lib/booking.mjs';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const OPERATOR = 'buyukcekmece-wsc';
const SLUG = 'elektrikli-sup-deneyimi';
const COMMISSION_BP = 1800;

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

// =====================================================================
// BÖLÜM A — Defterin kendisi: ayrı bir veritabanında, gerçek ifadelerle
// =====================================================================
//
// Sunucuya ihtiyaç duymuyor. Buradaki amaç yarışı izole etmek: uygulamanın
// geri kalanı karışmadan, tam olarak serbest bırakma ifadesinin ne yaptığını
// görmek.

const dir = mkdtempSync(join(tmpdir(), 'rastla-payout-'));
const DB = join(dir, 'test.db');
const schema = readFileSync(join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8');

const local = new Database(DB);
local.exec(schema);
local.pragma('busy_timeout = 5000');

const now = new Date().toISOString();

local.prepare(`INSERT INTO operators (id,name,created_at) VALUES ('op-1','Test',?)`).run(now);
local.prepare(`INSERT INTO users (id,phone,name,created_at) VALUES ('u-1','905550000000','Test',?)`).run(now);

const makeBooking = local.prepare(
  `INSERT INTO bookings (id,code,user_id,activity_slug,operator_id,booking_date,booking_time,
     adults,children,total_try,status,created_at)
   VALUES (?,?,'u-1','test','op-1','2026-09-01','10:00',2,0,?, 'confirmed',?)`
);
const makePayment = local.prepare(
  `INSERT INTO payments (id,booking_id,provider,conversation_id,amount_try,commission_try,
     status,item_transaction_ref,created_at,updated_at)
   VALUES (?,?,'fake',?,?,?, 'succeeded',?,?,?)`
);
const makePayout = local.prepare(
  `INSERT INTO payouts (id,booking_id,payment_id,operator_id,gross_try,commission_try,
     refunded_try,net_try,status,provider_ref,held_at)
   VALUES (?,?,?,'op-1',?,?,0,?,'held',?,?)`
);

/** 1000 TL'lik bir rezervasyon; %18 komisyonla net 820. */
function seed(suffix) {
  const gross = 1000;
  const commission = Math.floor((gross * COMMISSION_BP) / 10000);
  makeBooking.run(`b-${suffix}`, `KOD${suffix}`, gross, now);
  makePayment.run(`p-${suffix}`, `b-${suffix}`, `conv-${suffix}`, gross, commission, `item-${suffix}`, now, now);
  makePayout.run(`po-${suffix}`, `b-${suffix}`, `p-${suffix}`, gross, commission, gross - commission, `item-${suffix}`, now);
  return { gross, commission, net: gross - commission };
}

const seeded = seed('1');
check(
  'komisyon %18 tam sayı aritmetiğiyle bölünüyor',
  seeded.commission === 180 && seeded.net === 820,
  `brüt 1000 → komisyon ${seeded.commission}, net ${seeded.net}`
);

// ---------- Tekrarlanan geri çağrı ikinci satır açamıyor ----------

let duplicateRejected = false;
try {
  makePayout.run('po-dup', 'b-1', 'p-1', 1000, 180, 820, 'item-1', now);
} catch (error) {
  duplicateRejected = /UNIQUE/i.test(String(error));
}
check('aynı rezervasyon için İKİNCİ hak ediş satırı açılamıyor', duplicateRejected);

// ---------- Serbest bırakma ve geri çevirme ifadeleri ----------
//
// Uygulamanın kullandığı ifadelerin AYNISI (lib/db/payouts.ts).

const RELEASE = `UPDATE payouts SET status = 'released', released_at = ?
                  WHERE booking_id = ? AND status = 'held'`;
const REVERSE = `UPDATE payouts SET status = 'reversed', reversed_at = ?, net_try = 0
                  WHERE booking_id = ? AND status = 'held'`;

seed('2');
check(
  'bloke hak ediş geri çevrilebiliyor',
  local.prepare(REVERSE).run(now, 'b-2').changes === 1
);
check(
  'geri çevrilmiş hak ediş serbest bırakılamıyor',
  local.prepare(RELEASE).run(now, 'b-2').changes === 0
);
check(
  'geri çevrilen hak edişin neti sıfırlanıyor',
  local.prepare('SELECT net_try FROM payouts WHERE booking_id=?').get('b-2').net_try === 0
);

seed('3');
check('bloke hak ediş serbest bırakılıyor', local.prepare(RELEASE).run(now, 'b-3').changes === 1);
check(
  'serbest bırakılmış hak ediş İKİNCİ kez bırakılamıyor',
  local.prepare(RELEASE).run(now, 'b-3').changes === 0
);
check(
  'serbest bırakılmış hak ediş geri ÇEVRİLEMİYOR — hizmet verildi',
  local.prepare(REVERSE).run(now, 'b-3').changes === 0
);

// ---------- İade defteri düşürüyor ----------

seed('4');
const REFUND = `UPDATE payouts
   SET refunded_try = refunded_try + ?,
       net_try = CASE
         WHEN gross_try - commission_try - (refunded_try + ?) > 0
         THEN gross_try - commission_try - (refunded_try + ?)
         ELSE 0
       END
 WHERE booking_id = ?`;

local.prepare(REFUND).run(400, 400, 400, 'b-4');
const partial = local.prepare('SELECT refunded_try, net_try FROM payouts WHERE booking_id=?').get('b-4');
check(
  'kısmi iade neti düşürüyor',
  partial.refunded_try === 400 && partial.net_try === 420,
  `iade ${partial.refunded_try}, net ${partial.net_try}`
);

local.prepare(REFUND).run(1000, 1000, 1000, 'b-4');
const full = local.prepare('SELECT net_try FROM payouts WHERE booking_id=?').get('b-4');
check('iade toplamı brütü aşsa da net NEGATİFE inmiyor', full.net_try === 0, `net ${full.net_try}`);

// ---------- GERÇEK YARIŞ: 12 süreç, tek bilet ----------
//
// İki kasiyer aynı bileti aynı anda okutursa hak ediş iki kez doğmamalı ve
// sağlayıcıya iki onay çağrısı gitmemeli. Kazananı belirleyen tek şey bu
// koşullu UPDATE; "önce bak, held mi, sonra yaz" yazılsaydı 12 sürecin hepsi
// "held" görüp hepsi yazardı.

seed('race');
local.close();

const worker = `
const Database = require('better-sqlite3');
const conn = new Database(process.argv[1]);
conn.pragma('busy_timeout = 10000');
const n = conn.prepare(\`UPDATE payouts SET status='released', released_at='${now}'
   WHERE booking_id='b-race' AND status='held'\`).run().changes;
conn.close();
process.stdout.write(String(n));
`;

const results = await Promise.all(
  Array.from({ length: 12 }, () =>
    execFileAsync(process.execPath, ['-e', worker, DB], { encoding: 'utf8' })
      .then((r) => Number(r.stdout.trim()))
      .catch(() => -1)
  )
);

const winners = results.filter((n) => n === 1).length;
check(
  '12 eşzamanlı serbest bırakma denemesinden TAM OLARAK biri geçiyor',
  winners === 1,
  `geçen: ${winners}`
);

const racedRow = new Database(DB)
  .prepare('SELECT status, net_try FROM payouts WHERE booking_id=?')
  .get('b-race');
check(
  'yarış sonunda defter tutarlı: tek serbest bırakma, net bozulmamış',
  racedRow.status === 'released' && racedRow.net_try === 820,
  `${racedRow.status} / ${racedRow.net_try}`
);

rmSync(dir, { recursive: true, force: true });

// =====================================================================
// BÖLÜM B — Uçtan uca: gerçek ödeme akışı, gerçek check-in, gerçek onay
// =====================================================================
//
// Bölüm A ifadelerin doğruluğunu gösteriyor; burada o ifadelerin GERÇEKTEN
// çağrıldığı kanıtlanıyor. Doğru yazılmış ama hiç çağrılmayan bir ifade
// hiçbir şeyi garanti etmez.

const store = await connect();
await ensureTestAccounts();

await store.run(`UPDATE operators SET submerchant_key = ?, commission_bp = ? WHERE id = ?`, [
  'test-submerchant-key',
  COMMISSION_BP,
  OPERATOR,
]);
// Hız sınırı kovaları temizlenir; sınırın kendisi verify-rate-limit'te sınanıyor.
await store.run('DELETE FROM rate_limits');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

async function freshPage() {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/**
 * Ödemesi tamamlanmış bir rezervasyon üretir.
 *
 * Geri çağrı ADRESİ elle kuruluyor ama SONUCU sağlayıcıdan sorulmaya devam
 * ediyor: kısayol yok, ödeme akışının tamamı gerçekten koşuyor.
 */
async function paidBooking(prefix, name) {
  const { context, page } = await freshPage();
  const phone = testPhone(prefix);
  const result = await book(page, {
    baseUrl: BASE,
    slug: SLUG,
    name,
    phone: phone.display,
    stopAtPayment: true,
  });
  await context.close();

  if (!result.paymentUrl) return { error: result.error ?? 'ödeme adımına gidilmedi' };

  const payment = await store.get(
    `SELECT p.* FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       JOIN users u ON u.id = b.user_id
      WHERE u.phone = ? ORDER BY p.created_at DESC`,
    [phone.normalized]
  );
  if (!payment) return { error: 'ödeme kaydı bulunamadı' };

  const response = await fetch(`${BASE}/odeme/donus?token=${payment.token}`, {
    redirect: 'manual',
  });
  if (response.status >= 500) return { error: `geri çağrı ${response.status}` };

  const booking = await store.get('SELECT * FROM bookings WHERE id = ?', [payment.booking_id]);
  return { booking, payment: await store.get('SELECT * FROM payments WHERE id = ?', [payment.id]) };
}

/**
 * CSV'yi TARAYICININ İÇİNDEN indirir.
 *
 * `page.request` kullanılmıyor: oturum çerezini taşımadığı için her istek 403
 * dönüyor ve "yönetici indiremiyor" kontrolü, yetki kontrolü çalıştığı için
 * değil oturum hiç gitmediği için geçiyordu — yani hiçbir şey sınamıyordu.
 * Sayfanın kendi `fetch`'i gerçek kullanıcının yolunu izliyor.
 */
async function downloadReport(page) {
  const [status, body] = await page.evaluate(async () => {
    const response = await fetch('/isletme/finans/rapor');
    return [response.status, (await response.text()).slice(0, 200)];
  });
  return { status, body };
}

const approvalsFor = async (itemRef) =>
  store.all('SELECT action FROM fake_item_approvals WHERE item_ref = ?', [itemRef]);

const payoutFor = async (bookingId) =>
  store.get('SELECT * FROM payouts WHERE booking_id = ?', [bookingId]);

// ---------- 5. Ödeme → held, check-in → released + approve ----------

// İki senaryonun müşteri adları BİLEREK farklı: Bugün ekranında satırı adıyla
// buluyoruz ve aynı ad kullanılsaydı okutulmuş olan ilk kayıt seçilir, ikinci
// senaryo sessizce yanlış satırı sınardı.
/**
 * Her koşuda TEKİL ad.
 *
 * Bugün ekranında satırı adıyla buluyoruz ve ad sabit olsaydı önceki koşudan
 * kalan (çoktan işaretlenmiş) kayıt seçilirdi — test, üzerinde hiçbir düğme
 * bulunmayan eski bir satırı beklerken donardı.
 */
const RUN = Date.now().toString().slice(-6);

const first = await paidBooking('5571', `Gelen Misafir ${RUN}`);

if (first.error) {
  check('ödemeli rezervasyon oluşturulabiliyor', false, first.error);
} else {
  check('ödemeli rezervasyon oluşturulabiliyor', true);
  check(
    'ödeme onaylandı',
    first.booking.status === 'confirmed',
    `durum: ${first.booking.status}`
  );

  // Kalem işlem kimliği: onay çağrısının anahtarı. Önce yakalanmıyordu ve
  // onay akışı tam olarak bu yüzden kurulamıyordu.
  check(
    'sağlayıcının KALEM İŞLEM kimliği yakalanıp saklandı',
    Boolean(first.payment.item_transaction_ref),
    first.payment.item_transaction_ref ?? 'yok'
  );
  check(
    'kalem işlem kimliği ödeme kimliğinden FARKLI',
    first.payment.item_transaction_ref !== first.payment.provider_ref,
    `${first.payment.item_transaction_ref} ≠ ${first.payment.provider_ref}`
  );

  const held = await payoutFor(first.booking.id);
  check('ödeme sonrası hak ediş BLOKE doğuyor', held?.status === 'held', held?.status ?? 'kayıt yok');

  if (held) {
    const expected = Math.floor((Number(held.gross_try) * COMMISSION_BP) / 10000);
    check(
      'komisyon ödeme anındaki oranla donduruldu (%18)',
      Number(held.commission_try) === expected &&
        Number(held.net_try) === Number(held.gross_try) - expected,
      `brüt ${held.gross_try}, komisyon ${held.commission_try}, net ${held.net_try}`
    );
  }

  check(
    'hizmet verilmeden sağlayıcıya onay GİTMİYOR',
    (await approvalsFor(first.payment.item_transaction_ref)).length === 0
  );

  // Bilet okutuluyor — gerçek personel, gerçek ekran.
  {
    const { context, page } = await freshPage();
    await loginAs(page, BASE, OPERATOR, 'owner');
    await page.goto(`${BASE}/isletme/tara`, { waitUntil: 'networkidle' });
    await page.fill('#code', first.booking.code);
    await page.getByRole('button', { name: /Onayla/ }).first().click();
    await page.waitForTimeout(2000);
    await context.close();
  }

  const released = await payoutFor(first.booking.id);
  check(
    'bilet okutulunca hak ediş SERBEST bırakılıyor',
    released?.status === 'released' && Boolean(released.released_at),
    released?.status ?? 'kayıt yok'
  );

  const approvals = await approvalsFor(first.payment.item_transaction_ref);
  check(
    'sağlayıcıya TAM OLARAK BİR onay çağrısı gitti',
    approvals.length === 1 && approvals[0].action === 'approve',
    approvals.map((a) => a.action).join(',') || 'çağrı yok'
  );

  // İkinci okutma denemesi: bilet zaten kullanılmış, hak ediş de öyle.
  {
    const { context, page } = await freshPage();
    await loginAs(page, BASE, OPERATOR, 'owner');
    await page.goto(`${BASE}/isletme/tara`, { waitUntil: 'networkidle' });
    await page.fill('#code', first.booking.code);
    await page.getByRole('button', { name: /Onayla/ }).first().click();
    await page.waitForTimeout(1500);
    await context.close();
  }

  check(
    'ikinci okutma İKİNCİ onay çağrısı üretmiyor',
    (await approvalsFor(first.payment.item_transaction_ref)).length === 1
  );
}

// ---------- 6. Gelmedi → reversed + disapprove ----------

const second = await paidBooking('5572', `Gelmeyen Misafir ${RUN}`);

if (second.error) {
  check('gelmedi senaryosu için rezervasyon oluşturulabiliyor', false, second.error);
} else {
  check('gelmedi senaryosu için rezervasyon oluşturulabiliyor', true);

  // Bugün ekranı yalnızca BUGÜNÜ gösteriyor; rezervasyonun tarihi bugüne
  // çekiliyor. Bu bir kısayol değil, sahne hazırlığı: sınanan güvence
  // (gelmedi → pay geri çevrilir) tarihten bağımsız.
  const today = new Date().toISOString().slice(0, 10);
  await store.run('UPDATE bookings SET booking_date = ? WHERE id = ?', [today, second.booking.id]);

  const { context, page } = await freshPage();
  await loginAs(page, BASE, OPERATOR, 'owner');
  await page.goto(`${BASE}/isletme/bugun`, { waitUntil: 'networkidle' });

  const row = page.locator('li').filter({ hasText: `Gelmeyen Misafir ${RUN}` }).first();
  const found = (await row.count()) > 0;
  check('gelmeyen müşteri Bugün ekranında görünüyor', found);

  if (found) {
    await row.getByRole('button', { name: 'Gelmedi' }).click();
    await page.waitForTimeout(2000);
  }
  await context.close();

  const reversed = await payoutFor(second.booking.id);
  check(
    'gelmeyen müşteride hak ediş GERİ ÇEVRİLİYOR',
    reversed?.status === 'reversed',
    reversed?.status ?? 'kayıt yok'
  );

  const calls = await approvalsFor(second.payment.item_transaction_ref);
  check(
    'sağlayıcıya disapprove gitti, approve GİTMEDİ',
    calls.length === 1 && calls[0].action === 'disapprove',
    calls.map((c) => c.action).join(',') || 'çağrı yok'
  );

  // Kapasite geri VERİLMİYOR: seans yapıldı, yer tutuldu.
  const slot = await store.get('SELECT booked FROM slots WHERE id = ?', [second.booking.slot_id]);
  check(
    'gelmeyen müşteride kapasite geri verilmiyor',
    Number(slot.booked) >= Number(second.booking.units),
    `booked: ${slot.booked}`
  );
}

// ---------- 7. Finans ekranı ve yetki ----------

{
  const { context, page } = await freshPage();
  await loginAs(page, BASE, OPERATOR, 'owner');
  await page.goto(`${BASE}/isletme/finans`, { waitUntil: 'networkidle' });
  const text = await page.locator('body').innerText();
  check('sahip hak ediş ekranını görebiliyor', /Hak Ediş/.test(text) && /Mutabakat/.test(text));
  check(
    'bekleyen ve hak edilen bakiye AYRI gösteriliyor',
    /Bekleyen bakiye/.test(text) && /Hak edilen/.test(text)
  );

  const csv = await downloadReport(page);
  check(
    'mutabakat raporu CSV olarak indirilebiliyor',
    csv.status === 200 && csv.body.includes('Brüt (TL)'),
    `${csv.status} · ${csv.body.split('\r\n')[0]?.slice(0, 40)}`
  );
  await context.close();
}

{
  // Yönetici operasyonu yürütür ama finansa giremez: rezervasyonu açan ile
  // parayı yönlendiren aynı kişi olmamalı (görev ayrılığı).
  const { context, page } = await freshPage();
  await loginAs(page, BASE, OPERATOR, 'manager');
  await page.goto(`${BASE}/isletme/finans`, { waitUntil: 'networkidle' });
  check(
    'yönetici hak ediş ekranına GİREMİYOR',
    !/Mutabakat/.test(await page.locator('body').innerText()),
    page.url()
  );

  const csv = await downloadReport(page);
  check('yönetici mutabakat raporunu İNDİREMİYOR', csv.status === 403, String(csv.status));
  await context.close();
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
