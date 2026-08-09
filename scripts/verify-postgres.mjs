/**
 * Postgres uyarlamasının testi.
 *
 * Projenin bütün doğruluk iddiası tek bir desene dayanıyor: karar, koşullu tek
 * bir SQL ifadesinde veriliyor. Bu desen SQLite'ta ayrı süreçlerle kanıtlandı
 * ama üretim Postgres'te çalışacak — aynı kanıt orada da gerekli. Motor
 * değişince sessizce bozulacak bir şey varsa burada görünür.
 *
 * Sınananlar (hepsi AYRI İŞLETİM SİSTEMİ SÜREÇLERİYLE, gerçek eşzamanlılık):
 *   1. Bilet onayı: 12 süreç aynı bileti onaylamaya çalışır, tam olarak biri geçer.
 *   2. Slot kapasitesi: 20 süreç 5 kişilik slota girer, tam olarak 5'i geçer.
 *   3. Hız sınırı: 30 süreç 10'luk kotayı tüketir, tam olarak 10'u geçer.
 *   4. Hesap silme: 8 süreç aynı hesabı siler, tam olarak biri geçer.
 *   5. Ödeme onayı: 12 süreç aynı geri çağrıyı işler, tam olarak biri onaylar.
 *   6. Yeniden planlama: 12 süreç aynı rezervasyonu taşır, tam olarak biri geçer.
 *
 * Ayrıca ağız farkları:
 *   5. COUNT(*) Postgres'te dizgi döner; toCount() sayıya çeviriyor mu.
 *   6. Adlandırılmış parametreler ($1'e çevriliyor, tekrar eden ad aynı numarayı alıyor).
 *   7. Şema kısıtları (CHECK) Postgres'te de uygulanıyor.
 *
 * Kullanım:
 *   DATABASE_URL=postgresql://… node scripts/verify-postgres.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { db as connect, toCount, translate, usingPostgres } from '../lib/db/index.mjs';

if (!usingPostgres) {
  console.error('Bu betik yalnızca Postgres için. DATABASE_URL tanımlayın.');
  process.exit(1);
}

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const execFileAsync = promisify(execFile);

const db = await connect();
const dir = mkdtempSync(join(tmpdir(), 'rastla-pg-'));

/**
 * Verilen SQL'i N ayrı SÜREÇTE aynı anda çalıştırır.
 *
 * Tek süreçte async ile denemek yeterli olmazdı: Node tek iş parçacıklıdır ve
 * istekler yine sıraya girerdi. Gerçek eşzamanlılık için işletim sistemi
 * süreçleri gerekiyor — sunucusuz ortamda da durum budur.
 */
async function race(count, sql, paramsFor) {
  const worker = join(dir, `worker-${randomUUID()}.mjs`);
  writeFileSync(
    worker,
    `import { db } from ${JSON.stringify(new URL('../lib/db/index.mjs', import.meta.url).href)};
const client = await db();
const result = await client.run(${JSON.stringify(sql)}, JSON.parse(process.argv[2]));
process.stdout.write(String(result.changes));
await client.close();
`
  );

  // Süreçler HEPSİ BİRDEN başlatılıyor.
  //
  // Önce `execFileSync` ile sırayla çalıştırılıyorlardı ve dosyanın başındaki
  // "gerçek eşzamanlılık" iddiası doğru değildi: her çocuk bir sonraki
  // başlamadan bitiyordu, dolayısıyla ortada yarış yoktu ve "tam olarak biri
  // geçiyor" sonucu koşullu UPDATE'ten değil, sıradan geliyordu. Test doğru
  // sonucu YANLIŞ SEBEPLE veriyordu — Postgres kilitlenmesinde bir sorun
  // olsaydı bu süit onu göremezdi. `verify-payouts.mjs` bunu baştan doğru
  // yapıyor; desen oradan alındı.
  return Promise.all(
    Array.from({ length: count }, (_, i) =>
      execFileAsync(process.execPath, [worker, JSON.stringify(paramsFor(i))], {
        encoding: 'utf8',
        timeout: 30000,
      })
        .then((r) => Number(r.stdout.trim()))
        .catch((error) => `HATA:${String(error).slice(0, 80)}`)
    )
  );
}

const now = new Date().toISOString();
const suffix = Date.now().toString().slice(-8);

// --- Hazırlık: yalnız bu koşuma ait kayıtlar ---

const operatorId = `pgtest-${suffix}`;
const activityId = `act-${suffix}`;
const slotId = `slot-${suffix}`;
const userId = randomUUID();
const bookingCode = `PGTEST-${suffix}`;

await db.run('INSERT INTO operators (id, name, created_at) VALUES (?, ?, ?)', [
  operatorId,
  'Postgres Test İşletmesi',
  now,
]);
await db.run(
  `INSERT INTO activities (id, operator_id, slug, title, category, price_try,
     duration_minutes, location_name, capacity_mode, created_at)
   VALUES (?, ?, ?, 'Postgres Testi', 'jet-ski', 100, 30, 'Sahil', 'per_person', ?)`,
  [activityId, operatorId, `pg-test-${suffix}`, now]
);
await db.run('INSERT INTO users (id, name, phone, created_at) VALUES (?, ?, ?, ?)', [
  userId,
  'Postgres Testi',
  `9099${suffix}`,
  now,
]);

// --- 1. Bilet onayı: tam olarak bir süreç geçmeli ---

await db.run(
  `INSERT INTO bookings (id, code, user_id, activity_slug, operator_id, units,
     booking_date, booking_time, adults, children, total_try, status, created_at)
   VALUES (?, ?, ?, ?, ?, 1, '2026-08-20', '10:00', 1, 0, 100, 'confirmed', ?)`,
  [randomUUID(), bookingCode, userId, `pg-test-${suffix}`, operatorId, now]
);

const redeemOutcomes = await race(
  12,
  `UPDATE bookings SET status = 'redeemed', redeemed_at = ?, redeemed_by = ?
    WHERE code = ? AND status = 'confirmed'`,
  (i) => [new Date().toISOString(), `worker-${i}`, bookingCode]
);
const redeemWinners = redeemOutcomes.filter((o) => o === 1).length;

check(
  '12 eşzamanlı süreçten tam olarak biri bileti onaylıyor',
  redeemWinners === 1,
  `kazanan: ${redeemWinners}, sonuçlar: ${redeemOutcomes.join(',')}`
);

const redeemed = await db.get('SELECT status, redeemed_by FROM bookings WHERE code = ?', [
  bookingCode,
]);
check(
  'bilet tek bir onaylayanla kapandı',
  redeemed.status === 'redeemed' && Boolean(redeemed.redeemed_by),
  `onaylayan: ${redeemed.redeemed_by}`
);

// --- 2. Slot kapasitesi: 5 kişilik slota 20 süreç ---

await db.run(
  `INSERT INTO slots (id, activity_id, rule_id, slot_date, slot_time, capacity, booked, status, created_at)
   VALUES (?, ?, NULL, '2026-08-21', '11:00', 5, 0, 'open', ?)`,
  [slotId, activityId, now]
);

const capacityOutcomes = await race(
  20,
  `UPDATE slots SET booked = booked + ?
    WHERE id = ? AND status = 'open' AND booked + ? <= capacity`,
  () => [1, slotId, 1]
);
const capacityWinners = capacityOutcomes.filter((o) => o === 1).length;

check(
  '5 kişilik slota 20 süreçten tam olarak 5 tanesi giriyor',
  capacityWinners === 5,
  `kazanan: ${capacityWinners}`
);

const slot = await db.get('SELECT booked, capacity FROM slots WHERE id = ?', [slotId]);
check(
  'slot kapasitesinin üzerine çıkılmadı',
  slot.booked === 5 && slot.booked <= slot.capacity,
  `booked=${slot.booked}, capacity=${slot.capacity}`
);

// --- 3. Hız sınırı: 10'luk kotaya 30 süreç ---
//
// Burada UPSERT + RETURNING sınanıyor; iki motorda da desteklenir ama
// eşzamanlı davranışı Postgres'te ayrıca doğrulanmalı.

const bucket = `pgtest:${suffix}`;
const limitOutcomes = await race(
  30,
  `INSERT INTO rate_limits (bucket, window_start, count)
        VALUES (@bucket, @now, 1)
   ON CONFLICT (bucket) DO UPDATE SET
        window_start = CASE WHEN rate_limits.window_start <= @cutoff
                            THEN @now ELSE rate_limits.window_start END,
        count        = CASE WHEN rate_limits.window_start <= @cutoff
                            THEN 1 ELSE rate_limits.count + 1 END
   RETURNING count, window_start`,
  () => ({
    bucket,
    now: new Date().toISOString(),
    cutoff: new Date(Date.now() - 900 * 1000).toISOString(),
  })
);

const counter = await db.get('SELECT count FROM rate_limits WHERE bucket = ?', [bucket]);
check(
  'hız sınırı sayacı 30 eşzamanlı denemenin hepsini saydı',
  toCount(counter.count) === 30,
  `count=${counter.count}, hiçbiri kaybolmadı`
);
check(
  'UPSERT + RETURNING her süreçte tek satır döndürdü',
  limitOutcomes.every((o) => o === 1),
  `sonuçlar: ${[...new Set(limitOutcomes)].join(',')}`
);

// --- 4. Hesap silme: 8 süreç aynı hesabı silmeye çalışıyor ---

const deleteOutcomes = await race(
  8,
  `UPDATE users SET name = ?, phone = ?, deleted_at = ?
    WHERE id = ? AND deleted_at IS NULL`,
  (i) => ['Silinmiş hesap', `silindi-${suffix}-${i}`, new Date().toISOString(), userId]
);
const deleteWinners = deleteOutcomes.filter((o) => o === 1).length;

check(
  '8 eşzamanlı silme isteğinden tam olarak biri geçiyor',
  deleteWinners === 1,
  `kazanan: ${deleteWinners}`
);

// --- 4b. Ödeme onayı: 12 süreç aynı geri çağrıyı işliyor ---
//
// Ödemenin en pahalı hatası burada olurdu: sağlayıcının geri çağrısı ile
// tarayıcının dönüşü aynı anda gelirse rezervasyon iki kez onaylanmamalı.
// SQLite'ta kanıtlandı; üretim Postgres'te çalışacağı için aynı kanıt burada
// da gerekiyor.

const paidCode = `PGPAY-${suffix}`;
const paidBookingId = randomUUID();
const paymentId = randomUUID();

await db.run(
  `INSERT INTO bookings (id, code, user_id, activity_slug, operator_id, units,
     booking_date, booking_time, adults, children, total_try, status, created_at)
   VALUES (?, ?, ?, ?, ?, 1, '2026-08-22', '10:00', 1, 0, 1000, 'pending_payment', ?)`,
  [paidBookingId, paidCode, userId, `pg-test-${suffix}`, operatorId, now]
);
await db.run(
  `INSERT INTO payments (id, booking_id, provider, conversation_id, amount_try,
     commission_try, currency, status, created_at, updated_at)
   VALUES (?, ?, 'pgtest', ?, 1000, 100, 'TRY', 'initiated', ?, ?)`,
  [paymentId, paidBookingId, paidBookingId, now, now]
);

const confirmOutcomes = await race(
  12,
  `UPDATE bookings SET status = 'confirmed', confirmed_at = ?
    WHERE id = ? AND status = 'pending_payment'`,
  () => [new Date().toISOString(), paidBookingId]
);
const confirmWinners = confirmOutcomes.filter((o) => o === 1).length;

check(
  '12 eşzamanlı ödeme geri çağrısından tam olarak biri onaylıyor',
  confirmWinners === 1,
  `kazanan: ${confirmWinners}, sonuçlar: ${confirmOutcomes.join(',')}`
);

const confirmed = await db.get('SELECT status, confirmed_at FROM bookings WHERE id = ?', [
  paidBookingId,
]);
check(
  'onaylanan rezervasyonun onay zamanı yazıldı',
  confirmed.status === 'confirmed' && Boolean(confirmed.confirmed_at),
  `durum ${confirmed.status}`
);

// --- 4c. Hak ediş: 12 süreç aynı payı serbest bırakmaya çalışıyor ---
//
// Ticari olarak en pahalı yarış bu: iki kasiyer aynı bileti aynı anda okutursa
// hak ediş iki kez doğmamalı ve sağlayıcıya iki onay çağrısı gitmemeli.
// SQLite'ta kanıtlandı (verify-payouts.mjs); üretim Postgres'te çalışacağı
// için aynı kanıt burada da gerekiyor.

await db.run(
  `INSERT INTO payouts (id, booking_id, payment_id, operator_id, gross_try,
     commission_try, refunded_try, net_try, status, provider_ref, held_at)
   VALUES (?, ?, ?, ?, 1000, 180, 0, 820, 'held', ?, ?)`,
  [randomUUID(), paidBookingId, paymentId, operatorId, `item-${suffix}`, now]
);

const releaseOutcomes = await race(
  12,
  `UPDATE payouts SET status = 'released', released_at = ?
    WHERE booking_id = ? AND status = 'held'`,
  () => [new Date().toISOString(), paidBookingId]
);
const releaseWinners = releaseOutcomes.filter((o) => o === 1).length;

check(
  '12 eşzamanlı hak ediş serbest bırakmasından tam olarak biri geçiyor',
  releaseWinners === 1,
  `kazanan: ${releaseWinners}, sonuçlar: ${releaseOutcomes.join(',')}`
);

const releasedRow = await db.get(
  'SELECT status, net_try, released_at FROM payouts WHERE booking_id = ?',
  [paidBookingId]
);
check(
  'yarış sonunda hak ediş defteri tutarlı',
  releasedRow.status === 'released' &&
    Number(releasedRow.net_try) === 820 &&
    Boolean(releasedRow.released_at),
  `${releasedRow.status} / net ${releasedRow.net_try}`
);

// Aynı rezervasyon için ikinci hak ediş satırı ŞEMA tarafından reddedilir:
// payouts.booking_id UNIQUE. Kontrol kodda olsaydı iki eşzamanlı geri çağrı
// ikisi de "yok" görüp ikisi de ekleyebilirdi.
let payoutDuplicateRejected = false;
try {
  await db.run(
    `INSERT INTO payouts (id, booking_id, payment_id, operator_id, gross_try,
       commission_try, refunded_try, net_try, status, held_at)
     VALUES (?, ?, ?, ?, 1000, 180, 0, 820, 'held', ?)`,
    [randomUUID(), paidBookingId, paymentId, operatorId, now]
  );
} catch (error) {
  payoutDuplicateRejected = /duplicate key|unique/i.test(String(error));
}
check(
  'aynı rezervasyon için ikinci hak ediş satırı açılamıyor (Postgres UNIQUE)',
  payoutDuplicateRejected
);

// İade idempotanlığı kodda değil ŞEMADA: UNIQUE (payment_id, reason).
await db.run(
  `INSERT INTO refunds (id, payment_id, amount_try, reason, status, created_at)
   VALUES (?, ?, 1000, 'weather', 'pending', ?)`,
  [randomUUID(), paymentId, now]
);

let secondRefundRejected = false;
try {
  await db.run(
    `INSERT INTO refunds (id, payment_id, amount_try, reason, status, created_at)
     VALUES (?, ?, 1000, 'weather', 'pending', ?)`,
    [randomUUID(), paymentId, now]
  );
} catch {
  secondRefundRejected = true;
}
check(
  'aynı ödeme aynı sebeple iki kez iade edilemiyor (Postgres UNIQUE)',
  secondRefundRejected
);

// Komisyon tutarı aşamaz — mutabakatı sessizce bozacak türden bir hatanın
// şema tarafındaki karşılığı.
let badCommissionRejected = false;
try {
  await db.run('UPDATE payments SET commission_try = amount_try + 1 WHERE id = ?', [paymentId]);
} catch {
  badCommissionRejected = true;
}
check('komisyon tutarı aşamıyor (CHECK)', badCommissionRejected);

// --- 5. COUNT(*) dizgi dönüşü ---

const raw = await db.get('SELECT COUNT(*) AS n FROM activities');
check(
  'COUNT(*) Postgres tarafından dizgi olarak dönüyor',
  typeof raw.n === 'string',
  `tip: ${typeof raw.n} — bu yüzden toCount() gerekiyor`
);
check(
  'toCount() dizgiyi sayıya çeviriyor',
  typeof toCount(raw.n) === 'number' && toCount(raw.n) > 0,
  `${toCount(raw.n)} aktivite`
);
// Doğrudan karşılaştırma yapılsaydı sessizce yanlış sonuç verirdi:
check(
  'ham karşılaştırma yanıltıcı olurdu (toCount neden var)',
  raw.n !== 0 && toCount(raw.n) !== 0,
  `'${raw.n}' === 0 -> ${raw.n === 0}`
);

// --- 6. Ağız çevirisi ---

const [sqlPositional, paramsPositional] = translate('SELECT ? AS a, ? AS b', [1, 2]);
check(
  'soru işaretleri $1, $2 oluyor',
  sqlPositional === 'SELECT $1 AS a, $2 AS b',
  sqlPositional
);

const [sqlNamed, paramsNamed] = translate('SELECT @x AS a, @y AS b, @x AS c', { x: 7, y: 8 });
check(
  'tekrar eden adlandırılmış parametre aynı numarayı alıyor',
  sqlNamed === 'SELECT $1 AS a, $2 AS b, $1 AS c' && paramsNamed.length === 2,
  `${sqlNamed} / ${JSON.stringify(paramsNamed)}`
);

const [sqlString] = translate("SELECT 'soru? işareti' AS a, ? AS b", [1]);
check(
  'dizgi sabitinin içindeki soru işaretine dokunulmuyor',
  sqlString === "SELECT 'soru? işareti' AS a, $1 AS b",
  sqlString
);

// Çevirinin gerçekten çalıştığı, sorguyu Postgres'e göndererek doğrulanır.
const named = await db.get('SELECT @x AS a, @y AS b, @x AS c', { x: 7, y: 8 });
check(
  'adlandırılmış parametreli sorgu Postgres tarafından çalıştırılıyor',
  Number(named.a) === 7 && Number(named.b) === 8 && Number(named.c) === 7,
  JSON.stringify(named)
);
check('yer tutucu sayısı doğru', paramsPositional.length === 2);

// --- 7. Şema kısıtları Postgres'te de geçerli ---

let overbookRejected = false;
try {
  await db.run('UPDATE slots SET booked = capacity + 1 WHERE id = ?', [slotId]);
} catch (error) {
  overbookRejected = String(error).includes('booked') || String(error).includes('check');
}
check(
  'CHECK kısıtı aşırı rezervasyonu Postgres tarafında da engelliyor',
  overbookRejected,
  'son savunma hattı yerinde'
);

let badStatusRejected = false;
try {
  await db.run(`UPDATE bookings SET status = 'sacma' WHERE code = ?`, [bookingCode]);
} catch (error) {
  badStatusRejected = String(error).includes('check') || String(error).includes('status');
}
check('geçersiz durum değeri reddediliyor', badStatusRejected);

// --- 4d. Yeniden planlama: 12 süreç aynı rezervasyonu taşımaya çalışıyor ---
//
// Taşımayı tekilleştiren şey `slot_id = <eski>` koşulu. SQLite'ta gerçek kod
// yoluyla kanıtlandı (verify-weather.mjs); üretim Postgres'te çalışacağı için
// aynı kanıt burada da gerekiyor. Kaybedilirse sonuç sessiz ve pahalı: bir
// rezervasyon tek bir slotta durur ama kapasite on iki yerde tutulmuş olur.

const moveFromSlot = `move-from-${suffix}`;
const moveToSlot = `move-to-${suffix}`;
const moveCode = `PGMOVE-${suffix}`;

for (const [id, time] of [
  [moveFromSlot, '15:00'],
  [moveToSlot, '16:00'],
]) {
  await db.run(
    `INSERT INTO slots (id, activity_id, slot_date, slot_time, capacity, booked, status, created_at)
     VALUES (?, ?, '2026-11-20', ?, 20, ?, 'open', ?)`,
    [id, activityId, time, id === moveFromSlot ? 2 : 0, now]
  );
}

await db.run(
  `INSERT INTO bookings (id, code, user_id, activity_slug, operator_id, slot_id, units,
     booking_date, booking_time, adults, children, total_try, status, created_at)
   VALUES (?, ?, ?, ?, ?, ?, 2, '2026-11-20', '15:00', 2, 0, 800, 'confirmed', ?)`,
  [randomUUID(), moveCode, userId, `pg-test-${suffix}`, operatorId, moveFromSlot, now]
);

const moveOutcomes = await race(
  12,
  `UPDATE bookings SET slot_id = ?, booking_time = '16:00', rescheduled_at = ?
    WHERE code = ? AND status = 'confirmed' AND slot_id = ?`,
  () => [moveToSlot, new Date().toISOString(), moveCode, moveFromSlot]
);
const moveWinners = moveOutcomes.filter((o) => o === 1).length;

check(
  '12 eşzamanlı taşıma denemesinden tam olarak biri geçiyor (Postgres)',
  moveWinners === 1,
  `kazanan: ${moveWinners}, sonuçlar: ${moveOutcomes.join(',')}`
);

const movedRow = await db.get('SELECT slot_id, booking_time FROM bookings WHERE code = ?', [
  moveCode,
]);
check(
  'yarış sonunda rezervasyon TEK bir slotta',
  movedRow.slot_id === moveToSlot && movedRow.booking_time === '16:00',
  `${movedRow.slot_id} @ ${movedRow.booking_time}`
);

// --- 5. Yeni tablolar: hava, şube, üyelik, acente ---
//
// Bu tabloların doğruluk iddiaları SQLite'ta kanıtlandı; burada sınanan şey
// AĞIZ FARKI: `ON CONFLICT DO UPDATE` ve `UNIQUE` kısıtları Postgres'te de
// aynı davranıyor mu. Şema iki motorda ayrı ayrı yorumlanıyor ve bir kısıtın
// yalnızca birinde tutması, sorunun ancak üretimde görülmesi demek olurdu.

const forecastDate = '2026-11-05';

async function upsertForecast(wind, verdict) {
  await db.run(
    `INSERT INTO weather_forecasts
       (id, activity_id, forecast_date, wind_kmh, verdict, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (activity_id, forecast_date) DO UPDATE SET
       wind_kmh = excluded.wind_kmh,
       verdict = excluded.verdict,
       fetched_at = excluded.fetched_at`,
    [randomUUID(), activityId, forecastDate, wind, verdict, new Date().toISOString()]
  );
}

await upsertForecast(20, 'uygun');
await upsertForecast(45, 'elverissiz');

const forecastRows = await db.all(
  'SELECT wind_kmh, verdict FROM weather_forecasts WHERE activity_id = ? AND forecast_date = ?',
  [activityId, forecastDate]
);
check(
  'hava tahmini ON CONFLICT ile GÜNCELLENİYOR, çoğalmıyor (Postgres)',
  forecastRows.length === 1 && forecastRows[0].verdict === 'elverissiz',
  `${forecastRows.length} satır, hüküm ${forecastRows[0]?.verdict}`
);

let badVerdictRejected = false;
try {
  await db.run(
    `INSERT INTO weather_forecasts (id, activity_id, forecast_date, verdict, fetched_at)
     VALUES (?, ?, '2026-11-06', 'sacma', ?)`,
    [randomUUID(), activityId, new Date().toISOString()]
  );
} catch (error) {
  badVerdictRejected = /check|verdict/i.test(String(error));
}
check('geçersiz hava hükmü reddediliyor (Postgres CHECK)', badVerdictRejected);

// Şube: ilan silinmeden şube silinebilmeli ve ilan şubesiz kalmalı.
const branchId = randomUUID();
await db.run(
  'INSERT INTO branches (id, operator_id, name, created_at) VALUES (?, ?, ?, ?)',
  [branchId, operatorId, 'Postgres Şubesi', now]
);
await db.run('UPDATE activities SET branch_id = ? WHERE id = ?', [branchId, activityId]);
await db.run('DELETE FROM branches WHERE id = ?', [branchId]);

const orphan = await db.get('SELECT branch_id FROM activities WHERE id = ?', [activityId]);
check(
  'şube silinince ilan duruyor ve şubesiz kalıyor (Postgres ON DELETE SET NULL)',
  orphan !== undefined && orphan.branch_id === null,
  `branch_id: ${String(orphan?.branch_id)}`
);

// Üyelik: aynı çift için ikinci satır açılamıyor.
const memberUserId = randomUUID();
await db.run(
  `INSERT INTO operator_users (id, operator_id, email, name, password_hash, role, status, created_at)
   VALUES (?, ?, ?, 'Postgres Üye', 'x', 'owner', 'active', ?)`,
  [memberUserId, operatorId, `uye-${suffix}@ornek.local`, now]
);

const otherOperatorId = randomUUID();
await db.run('INSERT INTO operators (id, name, created_at) VALUES (?, ?, ?)', [
  otherOperatorId,
  'Postgres İkinci İşletme',
  now,
]);

await db.run(
  `INSERT INTO operator_memberships (id, operator_user_id, operator_id, role, created_at)
   VALUES (?, ?, ?, 'staff', ?)
   ON CONFLICT (operator_user_id, operator_id) DO UPDATE SET role = excluded.role`,
  [randomUUID(), memberUserId, otherOperatorId, now]
);
await db.run(
  `INSERT INTO operator_memberships (id, operator_user_id, operator_id, role, created_at)
   VALUES (?, ?, ?, 'manager', ?)
   ON CONFLICT (operator_user_id, operator_id) DO UPDATE SET role = excluded.role`,
  [randomUUID(), memberUserId, otherOperatorId, now]
);

const memberships = await db.all(
  'SELECT role FROM operator_memberships WHERE operator_user_id = ?',
  [memberUserId]
);
check(
  'aynı üyelik iki kez verilince tek satır kalıyor ve rol güncelleniyor (Postgres)',
  memberships.length === 1 && memberships[0].role === 'manager',
  `${memberships.length} satır, rol ${memberships[0]?.role}`
);

// Acente: e-posta tekilliği ve askı.
const agencyId = randomUUID();
await db.run(
  `INSERT INTO agencies (id, name, status, created_at) VALUES (?, ?, 'active', ?)`,
  [agencyId, 'Postgres Acentesi', now]
);

const agencyUserId = randomUUID();
const agencyEmail = `acente-${suffix}@ornek.local`;
await db.run(
  `INSERT INTO agency_users (id, agency_id, email, name, password_hash, status, created_at)
   VALUES (?, ?, ?, 'Postgres Acente Personeli', 'x', 'active', ?)`,
  [agencyUserId, agencyId, agencyEmail, now]
);

let agencyDuplicateRejected = false;
try {
  await db.run(
    `INSERT INTO agency_users (id, agency_id, email, name, password_hash, status, created_at)
     VALUES (?, ?, ?, 'Kopya', 'x', 'active', ?)`,
    [randomUUID(), agencyId, agencyEmail, now]
  );
} catch (error) {
  agencyDuplicateRejected = /duplicate key|unique/i.test(String(error));
}
check('aynı e-postayla ikinci acente hesabı açılamıyor (Postgres UNIQUE)', agencyDuplicateRejected);

// Fiyatlandırma: grup indiriminin ON CONFLICT'i ve kuralın CHECK'i.
//
// `upsertGroupDiscount` tek ifadede yazıp güncelliyor; bu davranış SQLite'ta
// sınandı ama asıl üretim veritabanı Postgres ve iki motorun ON CONFLICT
// yorumu aynı olmak zorunda — ayrılsaydı işletme aynı eşiği ikinci kez
// girdiğinde üretimde hata görür, geliştirmede görmezdi.
await db.run(
  `INSERT INTO group_discounts (id, activity_id, min_people, percent, created_at)
   VALUES (?, ?, 6, 10, ?)`,
  [randomUUID(), activityId, now]
);
await db.run(
  `INSERT INTO group_discounts (id, activity_id, min_people, percent, created_at)
   VALUES (?, ?, 6, 25, ?)
   ON CONFLICT (activity_id, min_people) DO UPDATE SET percent = excluded.percent`,
  [randomUUID(), activityId, now]
);

const discountRows = await db.all(
  'SELECT percent FROM group_discounts WHERE activity_id = ? AND min_people = 6',
  [activityId]
);
check(
  'grup indirimi ON CONFLICT ile GÜNCELLENİYOR, çoğalmıyor (Postgres)',
  discountRows.length === 1 && Number(discountRows[0].percent) === 25,
  `${discountRows.length} satır, %${discountRows[0]?.percent}`
);

let badRuleRejected = false;
try {
  await db.run(
    `INSERT INTO price_rules (id, activity_id, label, priority, weekdays, price_try, created_at)
     VALUES (?, ?, 'Hiçbir gün', 0, 0, 500, ?)`,
    [randomUUID(), activityId, now]
  );
} catch (error) {
  badRuleRejected = /check|constraint/i.test(String(error));
}
check(
  'hiçbir güne uymayan fiyat kuralı reddediliyor (Postgres CHECK)',
  badRuleRejected,
  'sessizce kabul edilseydi işletme listede gördüğü kuralın neden çalışmadığını bulamazdı'
);

// Kapora: tahsil edilen tutar toplamı geçemez.
//
// Geçebilseydi "tesiste −X TL ödenecek" diye bir kayıt üretilir ve hak ediş
// ile iade o kayda dayanırdı. Kısıt Postgres tarafında da duruyor mu, asıl
// üretim veritabanı orası olduğu için ayrıca sınanıyor.
let depositOverflowRejected = false;
try {
  await db.run(
    `INSERT INTO bookings
       (id, code, user_id, activity_slug, operator_id, units,
        booking_date, booking_time, adults, children, total_try, deposit_try,
        status, created_at)
     VALUES (?, ?, ?, ?, ?, 1, '2026-08-20', '10:00', 1, 0, 100, 500, 'confirmed', ?)`,
    [
      randomUUID(),
      `KAPORA-TASKIN-${suffix}`.slice(0, 40),
      userId,
      `pg-test-${suffix}`,
      operatorId,
      now,
    ]
  );
} catch (error) {
  depositOverflowRejected = /check|constraint/i.test(String(error));
}
check(
  'kapora toplamı AŞAMIYOR (Postgres CHECK)',
  depositOverflowRejected,
  'aşabilseydi tesiste eksi tutar ödenecek bir rezervasyon yazılabilirdi'
);

// --- Temizlik ---

// Sıra önemli: yabancı anahtarlar yüzünden iade -> ödeme -> rezervasyon.
// Sıra yabancı anahtarların TERSİ: payouts, payments'a bakıyor.
await db.run('DELETE FROM weather_forecasts WHERE activity_id = ?', [activityId]);
await db.run('DELETE FROM group_discounts WHERE activity_id = ?', [activityId]);
await db.run('DELETE FROM price_rules WHERE activity_id = ?', [activityId]);
await db.run('DELETE FROM agency_users WHERE agency_id = ?', [agencyId]);
await db.run('DELETE FROM agencies WHERE id = ?', [agencyId]);
await db.run('DELETE FROM operator_memberships WHERE operator_user_id = ?', [memberUserId]);
await db.run('DELETE FROM operator_users WHERE id = ?', [memberUserId]);
await db.run('DELETE FROM payouts WHERE payment_id = ?', [paymentId]);
await db.run('DELETE FROM refunds WHERE payment_id = ?', [paymentId]);
await db.run('DELETE FROM payments WHERE id = ?', [paymentId]);
await db.run('DELETE FROM bookings WHERE id = ?', [paidBookingId]);
await db.run('DELETE FROM bookings WHERE code IN (?, ?)', [bookingCode, moveCode]);
await db.run('DELETE FROM slots WHERE id IN (?, ?)', [moveFromSlot, moveToSlot]);
await db.run('DELETE FROM slots WHERE id = ?', [slotId]);
await db.run('DELETE FROM activities WHERE id = ?', [activityId]);
await db.run('DELETE FROM users WHERE id = ?', [userId]);
await db.run('DELETE FROM operators WHERE id IN (?, ?)', [operatorId, otherOperatorId]);
await db.run('DELETE FROM rate_limits WHERE bucket = ?', [bucket]);
await db.close();

rmSync(dir, { recursive: true, force: true });

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti (Postgres)`);
process.exit(failed ? 1 : 0);
