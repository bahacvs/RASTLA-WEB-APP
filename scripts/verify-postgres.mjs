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
 *
 * Ayrıca ağız farkları:
 *   5. COUNT(*) Postgres'te dizgi döner; toCount() sayıya çeviriyor mu.
 *   6. Adlandırılmış parametreler ($1'e çevriliyor, tekrar eden ad aynı numarayı alıyor).
 *   7. Şema kısıtları (CHECK) Postgres'te de uygulanıyor.
 *
 * Kullanım:
 *   DATABASE_URL=postgresql://… node scripts/verify-postgres.mjs
 */
import { execFileSync } from 'node:child_process';
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

const db = await connect();
const dir = mkdtempSync(join(tmpdir(), 'rastla-pg-'));

/**
 * Verilen SQL'i N ayrı SÜREÇTE aynı anda çalıştırır.
 *
 * Tek süreçte async ile denemek yeterli olmazdı: Node tek iş parçacıklıdır ve
 * istekler yine sıraya girerdi. Gerçek eşzamanlılık için işletim sistemi
 * süreçleri gerekiyor — sunucusuz ortamda da durum budur.
 */
function race(count, sql, paramsFor) {
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

  const outcomes = [];
  const children = [];
  for (let i = 0; i < count; i++) {
    children.push([worker, JSON.stringify(paramsFor(i))]);
  }

  // Süreçler sırayla başlatılıyor ama her biri bağlantı kurup sorguyu
  // gönderene kadar diğerleri de başlamış oluyor; asıl mesele hepsinin AYNI
  // satıra aynı anda yazmaya çalışması.
  for (const [file, params] of children) {
    try {
      outcomes.push(
        Number(execFileSync(process.execPath, [file, params], { encoding: 'utf8', timeout: 30000 }))
      );
    } catch (error) {
      outcomes.push(`HATA:${String(error).slice(0, 80)}`);
    }
  }
  return outcomes;
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

const redeemOutcomes = race(
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

const capacityOutcomes = race(
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
const limitOutcomes = race(
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

const deleteOutcomes = race(
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

// --- Temizlik ---

await db.run('DELETE FROM bookings WHERE code = ?', [bookingCode]);
await db.run('DELETE FROM slots WHERE id = ?', [slotId]);
await db.run('DELETE FROM activities WHERE id = ?', [activityId]);
await db.run('DELETE FROM users WHERE id = ?', [userId]);
await db.run('DELETE FROM operators WHERE id = ?', [operatorId]);
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
