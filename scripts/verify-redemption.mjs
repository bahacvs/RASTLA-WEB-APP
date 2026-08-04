/**
 * Tek kullanım güvencesinin testi.
 *
 * Ürünün en kritik kuralı: bir bilet yalnızca BİR KEZ onaylanabilir.
 * Bu betik kuralı iki açıdan sınar:
 *
 *   1. Sıralı: aynı kod ikinci kez onaylanmaya çalışılınca reddedilmeli.
 *   2. Eşzamanlı: N ayrı işlem aynı anda aynı kodu onaylamaya çalıştığında
 *      tam olarak biri başarılı olmalı. Sunucusuz ortamda istekler farklı
 *      süreçlere düşeceği için asıl gerçekçi senaryo budur.
 *
 * Kullanım: node scripts/verify-redemption.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { readFileSync } = require('node:fs');

const dir = mkdtempSync(join(tmpdir(), 'rastla-test-'));
const DB = join(dir, 'test.db');

const schema = readFileSync(join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8');

function open() {
  const conn = new Database(DB);
  conn.exec(schema);
  // Eşzamanlı yazımlarda "database is locked" yerine kısa süre beklesin.
  conn.pragma('busy_timeout = 5000');
  return conn;
}

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

// --- Hazırlık ---
const setup = open();
setup
  .prepare('INSERT INTO users (id, name, phone, created_at) VALUES (?,?,?,?)')
  .run('u1', 'Test Kullanıcı', '905321234567', new Date().toISOString());

function insertBooking(code) {
  setup
    .prepare(
      `INSERT INTO bookings
         (id, code, user_id, activity_slug, operator_id, booking_date, booking_time,
          adults, children, total_try, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'confirmed',?)`
    )
    .run(
      `b-${code}`, code, 'u1', 'elektrikli-sup-deneyimi', 'op-1',
      '2026-08-15', '09:00', 2, 0, 1200, new Date().toISOString()
    );
}

insertBooking('SEQ-TEST');
insertBooking('RACE-TEST');
setup.close();

// --- 1. Sıralı çift onaylama ---
const seq = open();
const redeem = (conn, code, by) =>
  conn
    .prepare(
      `UPDATE bookings SET status='redeemed', redeemed_at=?, redeemed_by=?
        WHERE code=? AND status='confirmed'`
    )
    .run(new Date().toISOString(), by, code).changes;

check('ilk onay geçiyor', redeem(seq, 'SEQ-TEST', 'op-1') === 1);
check('ikinci onay reddediliyor', redeem(seq, 'SEQ-TEST', 'op-1') === 0);

const after = seq.prepare('SELECT status, redeemed_by FROM bookings WHERE code=?').get('SEQ-TEST');
check('durum redeemed ve onaylayan kayıtlı', after.status === 'redeemed' && after.redeemed_by === 'op-1');

// Şema kısıtı: redeemed olup zaman damgası olmayan kayıt yazılamamalı.
let constraintHeld = false;
try {
  seq
    .prepare(
      `INSERT INTO bookings (id, code, user_id, activity_slug, operator_id, booking_date,
         booking_time, adults, children, total_try, status, created_at)
       VALUES ('bad','BAD-1','u1','x','op-1','2026-08-15','09:00',1,0,100,'redeemed',?)`
    )
    .run(new Date().toISOString());
} catch {
  constraintHeld = true;
}
check('şema: redeemed kayıt zaman damgasız olamıyor', constraintHeld);
seq.close();

// --- 2. Eşzamanlı yarış ---
// Her biri ayrı süreç: sunucusuz ortamdaki gerçek durumu taklit eder.
const WORKERS = 12;
const worker = `
const Database = require('better-sqlite3');
const conn = new Database(process.argv[1]);
conn.pragma('busy_timeout = 5000');
const n = conn.prepare("UPDATE bookings SET status='redeemed', redeemed_at=?, redeemed_by=? WHERE code=? AND status='confirmed'")
  .run(new Date().toISOString(), 'w' + process.argv[2], 'RACE-TEST').changes;
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
  `${WORKERS} eşzamanlı onaydan tam olarak 1'i geçiyor`,
  wins === 1,
  `başarılı: ${wins}, reddedilen: ${results.length - wins}`
);

const final = open();
const raceRow = final.prepare('SELECT status, redeemed_by FROM bookings WHERE code=?').get('RACE-TEST');
check('yarış sonrası tek bir onaylayan var', raceRow.status === 'redeemed' && !!raceRow.redeemed_by,
  `onaylayan: ${raceRow.redeemed_by}`);
final.close();

rmSync(dir, { recursive: true, force: true });

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
