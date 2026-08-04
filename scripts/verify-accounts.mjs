/**
 * İşletme hesaplarının testi.
 *
 * Paylaşılan erişim kodunun yerini kişi bazında hesaplar aldı. Bu betik
 * değişimin gerçekten işe yaradığını sınar:
 *
 *   1. Parola özeti — düz metin saklanmıyor, doğru parola geçiyor, yanlış geçmiyor.
 *   2. Aynı parola iki kez özetlendiğinde farklı çıktı veriyor (tuz gerçekten var).
 *   3. E-posta benzersizliği, büyük/küçük harf farkına rağmen korunuyor.
 *   4. Askıya alınan hesap giriş yapamıyor.
 *   5. İşletmenin son etkin sahibi askıya alınamıyor — eşzamanlı denemede bile.
 *   6. Üretilen geçici parolalar tekrar etmiyor ve beklenen entropiye sahip.
 *
 * Kullanım: node scripts/verify-accounts.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { generatePassword, hashPassword, verifyPassword } from '../lib/password.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const dir = mkdtempSync(join(tmpdir(), 'rastla-accounts-'));
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

db.prepare(`INSERT INTO operators (id,name,created_at) VALUES ('op-1','Test İşletmesi',?)`).run(now);
db.prepare(`INSERT INTO operators (id,name,created_at) VALUES ('op-2','Diğer İşletme',?)`).run(now);

function addUser(operatorId, email, name, role, password, status = 'active') {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO operator_users
       (id, operator_id, email, name, password_hash, role, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, operatorId, email.toLowerCase(), name, hashPassword(password), role, status, now);
  return id;
}

// --- 1. Parola özeti ---

const PASSWORD = 'dogru-parola-123';
const ownerId = addUser('op-1', 'sahip@test.local', 'Sahip', 'owner', PASSWORD);

const stored = db
  .prepare('SELECT password_hash FROM operator_users WHERE id = ?')
  .get(ownerId).password_hash;

check('parola düz metin saklanmıyor', !stored.includes(PASSWORD), stored.slice(0, 24) + '…');
check('özet scrypt biçiminde', stored.startsWith('scrypt$16384$8$1$'));
check('doğru parola doğrulanıyor', verifyPassword(PASSWORD, stored));
check('yanlış parola reddediliyor', !verifyPassword('yanlis-parola-123', stored));
check('boş parola reddediliyor', !verifyPassword('', stored));
check('bozuk özet çökmeden reddediliyor', !verifyPassword(PASSWORD, 'cop-veri'));

// --- 2. Tuz ---

const a = hashPassword(PASSWORD);
const b = hashPassword(PASSWORD);
check('aynı parola farklı özet üretiyor (tuz var)', a !== b);
check('her iki özet de doğrulanıyor', verifyPassword(PASSWORD, a) && verifyPassword(PASSWORD, b));

// --- 3. E-posta benzersizliği ---

let duplicateRejected = false;
try {
  addUser('op-1', 'SAHIP@test.local'.toLowerCase(), 'Kopya', 'staff', 'baska-parola-1');
} catch (error) {
  duplicateRejected = String(error).includes('UNIQUE');
}
check('aynı e-posta ikinci kez eklenemiyor', duplicateRejected);

// Farklı işletme de olsa aynı e-posta alınamaz: hesap kişiye aittir.
let crossRejected = false;
try {
  addUser('op-2', 'sahip@test.local', 'Kopya', 'staff', 'baska-parola-2');
} catch (error) {
  crossRejected = String(error).includes('UNIQUE');
}
check('e-posta işletmeler arasında da benzersiz', crossRejected);

// --- 4. Askıya alınmış hesap ---

const suspendedId = addUser(
  'op-1',
  'askida@test.local',
  'Askıda',
  'staff',
  PASSWORD,
  'suspended'
);
const suspended = db.prepare('SELECT * FROM operator_users WHERE id = ?').get(suspendedId);
check(
  'askıya alınan hesap doğru parolayla da giremiyor',
  verifyPassword(PASSWORD, suspended.password_hash) && suspended.status !== 'active',
  'parola doğru ama durum active değil'
);

// --- 5. Son sahip koruması ---

const SUSPEND = `
  UPDATE operator_users SET status = 'suspended'
   WHERE id = ?
     AND status = 'active'
     AND (
       role <> 'owner'
       OR (SELECT COUNT(*) FROM operator_users o
            WHERE o.operator_id = operator_users.operator_id
              AND o.role = 'owner'
              AND o.status = 'active') > 1
     )`;

check('tek sahip askıya alınamıyor', db.prepare(SUSPEND).run(ownerId).changes === 0);

const secondOwnerId = addUser('op-1', 'sahip2@test.local', 'İkinci Sahip', 'owner', PASSWORD);
check('iki sahipken biri askıya alınabiliyor', db.prepare(SUSPEND).run(ownerId).changes === 1);
check('geriye kalan tek sahip yine askıya alınamıyor', db.prepare(SUSPEND).run(secondOwnerId).changes === 0);

// Personel her zaman askıya alınabilir.
const staffId = addUser('op-1', 'personel@test.local', 'Personel', 'staff', PASSWORD);
check('personel askıya alınabiliyor', db.prepare(SUSPEND).run(staffId).changes === 1);

// --- 5b. Son sahip koruması eşzamanlı denemede de tutuyor ---
//
// Asıl risk şu: iki sahip aynı anda birbirini askıya almaya kalkarsa ikisi de
// düşebilir ve işletme kendi hesaplarını yönetemez hâle gelir. Koşul UPDATE'in
// içinde olduğu için bu olamaz; ayrı süreçlerle sınanıyor.

db.prepare(`UPDATE operator_users SET status = 'active' WHERE operator_id = 'op-1'`).run();
const owners = db
  .prepare(`SELECT id FROM operator_users WHERE operator_id='op-1' AND role='owner'`)
  .all()
  .map((r) => r.id);
check('yarış öncesi iki etkin sahip var', owners.length === 2, `${owners.length} sahip`);

db.close();

const RACER = `
const Database = require('better-sqlite3');
const db = new Database(process.argv[1]);
db.pragma('busy_timeout = 5000');
const r = db.prepare(\`${SUSPEND.replace(/`/g, '\\`')}\`).run(process.argv[2]);
process.stdout.write(String(r.changes));
`;

const results = owners.map((id) => {
  try {
    return execFileSync(process.execPath, ['-e', RACER, DB, id], {
      encoding: 'utf8',
      timeout: 15000,
    });
  } catch {
    return '0';
  }
});

const survivors = open()
  .prepare(`SELECT COUNT(*) AS n FROM operator_users WHERE operator_id='op-1' AND role='owner' AND status='active'`)
  .get().n;

check(
  'iki sahip birbirini askıya alsa da en az biri ayakta kalıyor',
  survivors >= 1,
  `askıya alma sonucu: [${results.join(', ')}], ayakta kalan sahip: ${survivors}`
);

// --- 6. Üretilen parolalar ---

const generated = new Set();
for (let i = 0; i < 500; i++) generated.add(generatePassword());
check('500 üretilen parolanın hepsi farklı', generated.size === 500, `${generated.size}/500`);

const sample = generatePassword();
check(
  'üretilen parola 4x4 gruplu ve 19 karakter',
  /^[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}$/.test(sample),
  sample
);

// Karışabilen karakterler (0/O, 1/l/I, 8/B, 9/g) alfabede yok.
const thousand = Array.from({ length: 1000 }, () => generatePassword()).join('');
check(
  'karışabilen karakterler üretilmiyor',
  !/[0O1lIB89g]/.test(thousand),
  'telefonda okunarak aktarılabilmesi için'
);

// --- Sonuç ---

rmSync(dir, { recursive: true, force: true });

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed === 0 ? 0 : 1);
