/**
 * Müsaitlik motorunun testi.
 *
 * En kritik kural: bir slot kapasitesinin üzerinde rezervasyon almamalı.
 * Bilet onayındaki gibi burada da asıl risk eşzamanlılıktır — son yeri iki
 * kişi aynı anda almaya çalıştığında yalnızca biri geçmelidir.
 *
 * Kullanım: node scripts/verify-capacity.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const dir = mkdtempSync(join(tmpdir(), 'rastla-cap-'));
const DB = join(dir, 'test.db');
const schema = readFileSync(join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8');

function open() {
  const conn = new Database(DB);
  conn.exec(schema);
  conn.pragma('busy_timeout = 5000');
  return conn;
}

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const db = open();
const now = new Date().toISOString();

db.prepare(
  `INSERT INTO activities (id,operator_id,slug,title,category,price_try,duration_minutes,
     location_name,capacity_mode,created_at)
   VALUES ('act-person','op-1','grup-sup','Grup SUP','sup',400,60,'Sahil','per_person',?)`
).run(now);

db.prepare(
  `INSERT INTO activities (id,operator_id,slug,title,category,price_try,duration_minutes,
     location_name,capacity_mode,created_at)
   VALUES ('act-booking','op-1','jet-ski','Jet Ski','jet-ski',1200,30,'Sahil','per_booking',?)`
).run(now);

// --- 1. Slot üretimi: 08:00–18:00 / 15 dk ---
// Kullanıcının tarif ettiği senaryo. Bir gün için beklenen: 40 slot.
function timesFor(start, end, step) {
  const m = (t) => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };
  const out = [];
  for (let x = m(start); x < m(end); x += step) {
    out.push(`${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`);
  }
  return out;
}

const times = timesFor('08:00', '18:00', 15);
check('08:00–18:00 / 15 dk => günde 40 slot', times.length === 40, `${times.length} slot, son: ${times.at(-1)}`);

const insertSlot = db.prepare(
  `INSERT INTO slots (id,activity_id,rule_id,slot_date,slot_time,capacity,booked,status,created_at)
   VALUES (?,?,NULL,?,?,?,0,'open',?)
   ON CONFLICT (activity_id, slot_date, slot_time) DO NOTHING`
);

let added = 0;
for (const t of times) added += insertSlot.run(`s-${t}`, 'act-person', '2026-08-20', t, 4, now).changes;
check('40 slot yazıldı', added === 40, `${added}`);

// İkinci kez çalıştırmak kopya üretmemeli.
let again = 0;
for (const t of times) again += insertSlot.run(`d-${t}`, 'act-person', '2026-08-20', t, 4, now).changes;
check('slot üretimi idempotent', again === 0, `ikinci turda eklenen: ${again}`);

// --- 2. Kapasite sınırı ---
const reserve = (conn, slotId, units) =>
  conn
    .prepare(
      `UPDATE slots SET booked = booked + ?
        WHERE id = ? AND status = 'open' AND booked + ? <= capacity`
    )
    .run(units, slotId, units).changes;

check('4 kapasiteli slota 4 kişi sığıyor', reserve(db, 's-08:00', 4) === 1);
check('dolu slota 1 kişi daha alınmıyor', reserve(db, 's-08:00', 1) === 0);

check('3 kişilik rezervasyon 4 kapasiteye sığıyor', reserve(db, 's-08:15', 3) === 1);
check('kalan 1 yere 2 kişi alınmıyor', reserve(db, 's-08:15', 2) === 0);
check('kalan 1 yere 1 kişi alınıyor', reserve(db, 's-08:15', 1) === 1);

// Kapalı slot rezervasyon almamalı.
db.prepare("UPDATE slots SET status='closed' WHERE id='s-08:30'").run();
check('kapalı slot rezervasyon almıyor', reserve(db, 's-08:30', 1) === 0);

// İptal kapasiteyi geri vermeli.
db.prepare('UPDATE slots SET booked = booked - ? WHERE id = ? AND booked >= ?').run(2, 's-08:00', 2);
check('iptal kapasiteyi geri veriyor', reserve(db, 's-08:00', 2) === 1);

// --- 3. Kapasite modu ---
// per_person: 2 kişilik rezervasyon 2 yer düşer. per_booking: 1 yer düşer.
const units = (mode, party) => (mode === 'per_person' ? party : 1);
check('per_person: 2 kişi => 2 birim', units('per_person', 2) === 2);
check('per_booking: 2 kişi => 1 birim', units('per_booking', 2) === 1);

insertSlot.run('jb-1', 'act-booking', '2026-08-20', '10:00', 4, now);
for (let i = 0; i < 4; i++) reserve(db, 'jb-1', units('per_booking', 2));
check(
  'per_booking slotu 4 ayrı rezervasyon alıyor',
  db.prepare('SELECT booked FROM slots WHERE id=?').get('jb-1').booked === 4
);
check('5. rezervasyon reddediliyor', reserve(db, 'jb-1', 1) === 0);

// --- 4. Rezervasyonu olan slot kural değişiminde korunmalı ---
insertSlot.run('keep-1', 'act-person', '2026-08-21', '09:00', 4, now);
reserve(db, 'keep-1', 2);
insertSlot.run('drop-1', 'act-person', '2026-08-21', '09:15', 4, now);

// Kurala uymayan slotlardan yalnızca boş olan kapatılır.
for (const id of ['keep-1', 'drop-1']) {
  const row = db.prepare('SELECT booked FROM slots WHERE id=?').get(id);
  if (row.booked === 0) db.prepare("UPDATE slots SET status='closed' WHERE id=?").run(id);
}
check(
  'rezervasyonlu slot korunuyor',
  db.prepare('SELECT status FROM slots WHERE id=?').get('keep-1').status === 'open'
);
check(
  'boş ve kuralsız slot kapatılıyor',
  db.prepare('SELECT status FROM slots WHERE id=?').get('drop-1').status === 'closed'
);

// --- 5. Eşzamanlı yarış: son yer ---
insertSlot.run('race-1', 'act-person', '2026-08-22', '11:00', 4, now);
reserve(db, 'race-1', 3); // geriye 1 yer kalır
db.close();

const WORKERS = 12;
const worker = `
const Database = require('better-sqlite3');
const conn = new Database(process.argv[1]);
conn.pragma('busy_timeout = 5000');
const n = conn.prepare("UPDATE slots SET booked = booked + 1 WHERE id = 'race-1' AND status='open' AND booked + 1 <= capacity").run().changes;
process.stdout.write(String(n));
`;

const results = await Promise.all(
  Array.from({ length: WORKERS }, (_, i) =>
    Promise.resolve().then(() =>
      execFileSync(process.execPath, ['-e', worker, DB, String(i)], { encoding: 'utf8' })
    )
  )
);

const wins = results.filter((r) => r === '1').length;
check(
  `son yer için ${WORKERS} eşzamanlı denemeden tam olarak 1'i geçiyor`,
  wins === 1,
  `başarılı: ${wins}, reddedilen: ${results.length - wins}`
);

const final = open();
const raceSlot = final.prepare('SELECT booked, capacity FROM slots WHERE id=?').get('race-1');
check(
  'yarış sonrası kapasite aşılmamış',
  raceSlot.booked === raceSlot.capacity,
  `${raceSlot.booked}/${raceSlot.capacity}`
);
final.close();

// --- 6. İptal kapasiteyi tam olarak bir kez iade etmeli ---
// Çift tıklama ya da tekrar gönderim kapasiteyi şişirmemeli.
const cancelDb = open();
// `insertSlot` kapatılmış bağlantıya ait; bu bağlantı için yeniden hazırlanır.
const insertSlot2 = cancelDb.prepare(
  `INSERT INTO slots (id,activity_id,rule_id,slot_date,slot_time,capacity,booked,status,created_at)
   VALUES (?,?,NULL,?,?,?,0,'open',?)
   ON CONFLICT (activity_id, slot_date, slot_time) DO NOTHING`
);

cancelDb
  .prepare("INSERT INTO users (id,name,phone,created_at) VALUES ('u2','İptal Test','905321112233',?)")
  .run(new Date().toISOString());

insertSlot2.run('cancel-slot', 'act-person', '2026-08-23', '12:00', 4, now);
cancelDb
  .prepare("UPDATE slots SET booked = 2 WHERE id = 'cancel-slot'")
  .run();
cancelDb
  .prepare(
    `INSERT INTO bookings (id, code, user_id, activity_slug, operator_id, slot_id, units,
       booking_date, booking_time, adults, children, total_try, status, created_at)
     VALUES ('bk-1','CANCEL-TEST','u2','grup-sup','op-1','cancel-slot',2,
       '2026-08-23','12:00',2,0,800,'confirmed',?)`
  )
  .run(new Date().toISOString());
cancelDb.close();

const CANCEL_WORKERS = 12;
const cancelWorker = `
const Database = require('better-sqlite3');
const conn = new Database(process.argv[1]);
conn.pragma('busy_timeout = 5000');
const n = conn.prepare("UPDATE bookings SET status='cancelled', cancelled_at=?, cancel_reason='customer' WHERE code='CANCEL-TEST' AND status='confirmed'").run(new Date().toISOString()).changes;
// Kapasite yalnızca UPDATE gerçekten uygulandıysa iade edilir.
if (n === 1) conn.prepare("UPDATE slots SET booked = booked - 2 WHERE id='cancel-slot' AND booked >= 2").run();
process.stdout.write(String(n));
`;

const cancelResults = await Promise.all(
  Array.from({ length: CANCEL_WORKERS }, (_, i) =>
    Promise.resolve().then(() =>
      execFileSync(process.execPath, ['-e', cancelWorker, DB, String(i)], { encoding: 'utf8' })
    )
  )
);

const cancelWins = cancelResults.filter((r) => r === '1').length;
check(
  `${CANCEL_WORKERS} eşzamanlı iptalden tam olarak 1'i geçiyor`,
  cancelWins === 1,
  `başarılı: ${cancelWins}`
);

const afterCancel = open();
const cancelSlot = afterCancel.prepare("SELECT booked FROM slots WHERE id='cancel-slot'").get();
check(
  'kapasite tam olarak bir kez iade edildi',
  cancelSlot.booked === 0,
  `booked: ${cancelSlot.booked} (beklenen 0)`
);

// Kullanılmış bilet iptal edilememeli.
afterCancel
  .prepare(
    `INSERT INTO slots (id,activity_id,rule_id,slot_date,slot_time,capacity,booked,status,created_at)
     VALUES ('used-slot','act-person',NULL,'2026-08-24','12:00',4,0,'open',?)`
  )
  .run(now);
afterCancel
  .prepare(
    `INSERT INTO bookings (id, code, user_id, activity_slug, operator_id, slot_id, units,
       booking_date, booking_time, adults, children, total_try, status, created_at, redeemed_at, redeemed_by)
     VALUES ('bk-2','USED-TEST','u2','grup-sup','op-1','used-slot',1,
       '2026-08-24','12:00',1,0,400,'redeemed',?,?, 'op-1')`
  )
  .run(new Date().toISOString(), new Date().toISOString());

const usedCancel = afterCancel
  .prepare(
    "UPDATE bookings SET status='cancelled', cancelled_at=?, cancel_reason='customer' WHERE code='USED-TEST' AND status='confirmed'"
  )
  .run(new Date().toISOString()).changes;
check('kullanılmış bilet iptal edilemiyor', usedCancel === 0);
afterCancel.close();

rmSync(dir, { recursive: true, force: true });

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
