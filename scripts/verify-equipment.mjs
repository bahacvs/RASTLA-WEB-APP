/**
 * Ekipman kapasitesinin testi.
 *
 * Kişi kapasitesi tek başına yetmiyor: jet skide asıl sınır araç sayısıdır.
 * 3 araç × 2 kişilik bir seansta kişi kapasitesi 6'dır, ama altı kişi tek
 * başına gelirse (her biri bir araç isterse) üçünden fazlası alınamaz.
 *
 * Sınananlar:
 *   1. İki sayaç bağımsız çalışıyor: kişi yeri varken ekipman bitebiliyor.
 *   2. Ayrı işletim sistemi süreçleriyle gerçek yarışta ekipman sınırı
 *      AŞILMIYOR. Aynı süreçte Promise.all yanıltıcı olurdu.
 *   3. İki sayaç BİRLİKTE tutuluyor ve BİRLİKTE iade ediliyor; yarım kalan
 *      bir durum (kişi tutuldu, araç tutulmadı) oluşmuyor.
 *   4. Havuz yoksa ekipman sayacı hiç devreye girmiyor — mevcut aktiviteler
 *      eskisi gibi çalışmaya devam ediyor.
 *
 * Kullanım: node scripts/verify-equipment.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const dir = mkdtempSync(join(tmpdir(), 'rastla-eq-'));
const DB = join(dir, 'test.db');
const schema = readFileSync(join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8');

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const db = new Database(DB);
db.exec(schema);
db.pragma('busy_timeout = 5000');

const now = new Date().toISOString();

db.prepare(`INSERT INTO operators (id,name,created_at) VALUES ('op-1','Test İşletmesi',?)`).run(now);

// Jet ski: 3 araç, araç başına 2 kişi. Kişi kapasitesi 6.
db.prepare(
  `INSERT INTO activities (id,operator_id,slug,title,category,price_try,duration_minutes,
     location_name,capacity_mode,created_at)
   VALUES ('act-jet','op-1','jet-ski','Jet Ski','jet-ski',1200,15,'Sahil','per_person',?)`
).run(now);

// Havuzsuz aktivite: ekipman sayacı hiç kullanılmamalı.
db.prepare(
  `INSERT INTO activities (id,operator_id,slug,title,category,price_try,duration_minutes,
     location_name,capacity_mode,created_at)
   VALUES ('act-sup','op-1','grup-sup','Grup SUP','sup',400,60,'Sahil','per_person',?)`
).run(now);

db.prepare(
  `INSERT INTO equipment_pools (id,activity_id,name,unit_count,capacity_per_unit,created_at)
   VALUES ('pool-1','act-jet','Jet ski',3,2,?)`
).run(now);

const insertSlot = db.prepare(
  `INSERT INTO slots (id,activity_id,rule_id,slot_date,slot_time,capacity,booked,
     unit_capacity,units_booked,status,created_at)
   VALUES (?,?,NULL,?,?,?,0,?,0,'open',?)`
);

insertSlot.run('jet-1', 'act-jet', '2026-09-01', '10:00', 6, 3, now);
insertSlot.run('jet-2', 'act-jet', '2026-09-01', '10:20', 6, 3, now);
insertSlot.run('sup-1', 'act-sup', '2026-09-01', '10:00', 8, null, now);

/** Uygulamanın kullandığı ifadenin AYNISI — iki koşul tek UPDATE'te. */
const reserve = (conn, slotId, units, equipment) =>
  conn
    .prepare(
      `UPDATE slots
          SET booked = booked + ?, units_booked = units_booked + ?
        WHERE id = ? AND status = 'open'
          AND booked + ? <= capacity
          AND (unit_capacity IS NULL OR units_booked + ? <= unit_capacity)`
    )
    .run(units, equipment, slotId, units, equipment).changes;

/** Kaç araç gerekiyor: 2 kişilik araca 3 kişi = 2 araç. */
const unitsNeeded = (participants, perUnit) => Math.ceil(participants / perUnit);

// ---------- 1. Yukarı yuvarlama ----------

check('1 kişi 1 araç tutuyor', unitsNeeded(1, 2) === 1);
check('2 kişi 1 araç tutuyor', unitsNeeded(2, 2) === 1);
check('3 kişi 2 araç tutuyor — yarım araç diye bir şey yok', unitsNeeded(3, 2) === 2);

// ---------- 2. Kişi yeri varken ekipman bitebiliyor ----------

// Üç ayrı tek kişilik rezervasyon: 3 kişi (kapasite 6, yer var) ama 3 araç
// (havuz doldu).
check('1. tek kişilik rezervasyon geçiyor', reserve(db, 'jet-1', 1, 1) === 1);
check('2. tek kişilik rezervasyon geçiyor', reserve(db, 'jet-1', 1, 1) === 1);
check('3. tek kişilik rezervasyon geçiyor', reserve(db, 'jet-1', 1, 1) === 1);

const afterThree = db.prepare('SELECT booked, units_booked FROM slots WHERE id=?').get('jet-1');
check(
  'kişi kapasitesinde HÂLÂ yer var',
  afterThree.booked === 3 && afterThree.booked < 6,
  `${afterThree.booked}/6 kişi`
);
check(
  'ama ekipman bitti: 4. kişi alınmıyor',
  reserve(db, 'jet-1', 1, 1) === 0,
  `${afterThree.units_booked}/3 araç`
);

// ---------- 3. İki sayaç birlikte iade ediliyor ----------

const release = db.prepare(
  `UPDATE slots SET booked = booked - ?, units_booked = units_booked - ?
    WHERE id = ? AND booked >= ? AND units_booked >= ?`
);
release.run(1, 1, 'jet-1', 1, 1);

const afterRelease = db.prepare('SELECT booked, units_booked FROM slots WHERE id=?').get('jet-1');
check(
  'iptal iki sayacı da geri veriyor',
  afterRelease.booked === 2 && afterRelease.units_booked === 2,
  `${afterRelease.booked} kişi / ${afterRelease.units_booked} araç`
);
check('boşalan araca yeni rezervasyon geliyor', reserve(db, 'jet-1', 1, 1) === 1);

// Çift iade koruması: aynı iade iki kez çağrılsa da sayaçlar negatife düşmez.
release.run(9, 9, 'jet-1', 9, 9);
const afterBogus = db.prepare('SELECT booked, units_booked FROM slots WHERE id=?').get('jet-1');
check(
  'geçersiz iade sayaçları bozmuyor',
  afterBogus.booked === 3 && afterBogus.units_booked === 3,
  `${afterBogus.booked}/${afterBogus.units_booked}`
);

// ---------- 4. Havuzsuz aktivite eskisi gibi ----------

check('havuzsuz slotta 8 kişi sığıyor', reserve(db, 'sup-1', 8, 0) === 1);
check('havuzsuz slotta 9. kişi alınmıyor', reserve(db, 'sup-1', 1, 0) === 0);
const sup = db.prepare('SELECT units_booked, unit_capacity FROM slots WHERE id=?').get('sup-1');
check(
  'havuzsuz slotta ekipman sayacı kullanılmıyor',
  sup.unit_capacity === null && sup.units_booked === 0
);

db.close();

// ---------- 5. GERÇEK YARIŞ: ayrı süreçler ----------
//
// 12 süreç aynı anda birer kişilik rezervasyon deniyor. Kişi kapasitesi 6,
// ekipman 3 araç. Beklenen: tam olarak 3 tanesi geçer — sınırı ekipman
// koyuyor, kişi kapasitesi değil.

// Betik `node -e` ile veriliyor ve proje dizininden çalışıyor: geçici bir
// dosyaya yazılsaydı better-sqlite3'ü çözemezdi (node_modules görünmez).
//
// execFile EŞZAMANSIZ. execFileSync kullanılsaydı süreçler sırayla çalışır ve
// ortada yarış kalmazdı — testin kanıtlamak istediği şey tam olarak eşzamanlı
// çakışma.
const worker = `
const Database = require('better-sqlite3');
const conn = new Database(process.argv[1]);
conn.pragma('busy_timeout = 10000');
const n = conn.prepare(\`
  UPDATE slots
     SET booked = booked + 1, units_booked = units_booked + 1
   WHERE id = 'jet-2' AND status = 'open'
     AND booked + 1 <= capacity
     AND (unit_capacity IS NULL OR units_booked + 1 <= unit_capacity)\`).run().changes;
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
const raced = new Database(DB).prepare('SELECT booked, units_booked FROM slots WHERE id=?').get('jet-2');

check(
  '12 eşzamanlı denemeden tam olarak 3 tanesi geçiyor',
  winners === 3,
  `geçen: ${winners}`
);
check(
  'sınırı EKİPMAN koydu, kişi kapasitesi değil',
  raced.units_booked === 3 && raced.booked === 3 && raced.booked < 6,
  `${raced.booked}/6 kişi · ${raced.units_booked}/3 araç`
);

rmSync(dir, { recursive: true, force: true });

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
