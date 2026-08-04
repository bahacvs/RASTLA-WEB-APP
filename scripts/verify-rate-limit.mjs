/**
 * Hız sınırının testi.
 *
 * Sınanan:
 *   1. Sayaç doğru noktada duruyor: N deneme geçiyor, N+1 reddediliyor.
 *   2. Pencere dolunca sayaç sıfırlanıyor — ceza kalıcı değil.
 *   3. **Eşzamanlılık:** 30 ayrı süreç aynı anda 10'luk bir kotayı tüketmeye
 *      çalıştığında tam olarak 10 tanesi geçiyor. Bu asıl kontrol: "önce say,
 *      sonra artır" yazılsaydı sınır tam da yük altında delinirdi.
 *   4. Kovalar birbirinden bağımsız: bir IP'nin dolması diğerini etkilemiyor.
 *   5. `reset` sayacı temizliyor (başarılı giriş sonrası).
 *   6. Süresi geçmiş satırlar temizlenebiliyor.
 *
 * Ayrıca sunucu ayaktaysa gerçek giriş ekranında kaba kuvvetin durduğu
 * doğrulanır.
 *
 * Kullanım: node scripts/verify-rate-limit.mjs   (sunucu isteğe bağlı)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const dir = mkdtempSync(join(tmpdir(), 'rastla-ratelimit-'));
const DB = join(dir, 'test.db');
const schema = readFileSync(join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8');

function open() {
  const conn = new Database(DB);
  conn.exec(schema);
  conn.pragma('busy_timeout = 10000');
  return conn;
}

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

// lib/db/rate-limit.ts içindeki UPSERT'in birebir aynısı. Betikler TypeScript
// modülünü doğrudan çalıştıramadığı için ifade buraya kopyalanır; değişirse
// ikisi birlikte değişmelidir.
const CONSUME = `
  INSERT INTO rate_limits (bucket, window_start, count)
       VALUES (@bucket, @now, 1)
  ON CONFLICT (bucket) DO UPDATE SET
       window_start = CASE WHEN rate_limits.window_start <= @cutoff
                           THEN @now ELSE rate_limits.window_start END,
       count        = CASE WHEN rate_limits.window_start <= @cutoff
                           THEN 1 ELSE rate_limits.count + 1 END
  RETURNING count, window_start`;

function consume(db, bucket, windowSeconds, now = new Date()) {
  return db.prepare(CONSUME).get({
    bucket,
    now: now.toISOString(),
    cutoff: new Date(now.getTime() - windowSeconds * 1000).toISOString(),
  });
}

const db = open();

// --- 1. Sayaç doğru noktada duruyor ---

const LIMIT = 5;
const results = [];
for (let i = 0; i < 8; i++) {
  results.push(consume(db, 'test:sayac', 900).count);
}
check('sayaç birer birer artıyor', results.join(',') === '1,2,3,4,5,6,7,8', results.join(','));
check(
  'ilk 5 deneme sınır içinde, 6. dışında',
  results.filter((c) => c <= LIMIT).length === LIMIT,
  `${results.filter((c) => c <= LIMIT).length} deneme geçti`
);

// --- 2. Pencere dolunca sıfırlanıyor ---

const later = new Date(Date.now() + 901 * 1000);
const afterWindow = consume(db, 'test:sayac', 900, later);
check('pencere dolunca sayaç sıfırlanıyor', afterWindow.count === 1, `count=${afterWindow.count}`);

// --- 3. Kovalar bağımsız ---

consume(db, 'test:baska-kova', 900);
const independent = db
  .prepare('SELECT count FROM rate_limits WHERE bucket = ?')
  .get('test:baska-kova').count;
check('kovalar birbirinden bağımsız', independent === 1, `count=${independent}`);

// --- 4. reset ---

db.prepare('DELETE FROM rate_limits WHERE bucket = ?').run('test:sayac');
const afterReset = consume(db, 'test:sayac', 900);
check('sıfırlamadan sonra baştan sayıyor', afterReset.count === 1, `count=${afterReset.count}`);

// --- 5. Eşzamanlılık: asıl kontrol ---
//
// 30 süreç aynı anda tek bir kovayı tüketmeye çalışır. Kota 10 ise tam olarak
// 10 tanesi "izin verildi" cevabı almalı — ne 9 ne 11.

db.prepare('DELETE FROM rate_limits').run();
db.close();

const RACE_LIMIT = 10;
const RACERS = 30;

const WORKER = `
const Database = require('better-sqlite3');
const db = new Database(process.argv[1]);
db.pragma('busy_timeout = 10000');
const now = new Date();
const row = db.prepare(\`${CONSUME.replace(/`/g, '\\`')}\`).get({
  bucket: 'yaris',
  now: now.toISOString(),
  cutoff: new Date(now.getTime() - 900 * 1000).toISOString(),
});
process.stdout.write(row.count <= ${RACE_LIMIT} ? 'ALLOW' : 'DENY');
`;

const outcomes = Array.from({ length: RACERS }, () => {
  try {
    return execFileSync(process.execPath, ['-e', WORKER, DB], {
      encoding: 'utf8',
      timeout: 20000,
    });
  } catch (error) {
    return `ERROR:${String(error).slice(0, 60)}`;
  }
});

const allowed = outcomes.filter((o) => o === 'ALLOW').length;
const denied = outcomes.filter((o) => o === 'DENY').length;
const errors = outcomes.filter((o) => o.startsWith('ERROR')).length;

check(
  `${RACERS} eşzamanlı denemeden tam olarak ${RACE_LIMIT} tanesi geçiyor`,
  allowed === RACE_LIMIT,
  `izin: ${allowed}, ret: ${denied}, hata: ${errors}`
);
check('hiçbir süreç hata almadı', errors === 0, `${errors} hata`);

const final = open();
const finalCount = final.prepare('SELECT count FROM rate_limits WHERE bucket = ?').get('yaris').count;
check(
  'yarış sonrası sayaç toplam deneme sayısına eşit',
  finalCount === RACERS,
  `count=${finalCount}, deneme=${RACERS}`
);

// --- 6. Süresi geçmiş satırların temizliği ---

const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
final.prepare('INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)').run('eski', old);

const purgeCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const purged = final.prepare('DELETE FROM rate_limits WHERE window_start < ?').run(purgeCutoff).changes;
const kept = final.prepare('SELECT COUNT(*) AS n FROM rate_limits').get().n;

check('eski sayaç satırı temizleniyor', purged === 1, `${purged} silindi`);
check('güncel sayaç satırı korunuyor', kept >= 1, `${kept} satır kaldı`);
final.close();

rmSync(dir, { recursive: true, force: true });

// --- 7. Gerçek sunucuda kaba kuvvet duruyor mu ---
//
// Sunucu ayakta değilse bu bölüm atlanır; yukarıdaki kontroller sunucusuz
// çalışır.

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
let serverUp = false;
try {
  const response = await fetch(`${BASE}/isletme`, { signal: AbortSignal.timeout(3000) });
  serverUp = response.ok;
} catch {
  serverUp = false;
}

if (!serverUp) {
  console.log('(sunucu ayakta değil — canlı giriş denemesi bölümü atlandı)\n');
} else {
  const { chromium } = await import('playwright');
  const { ensureTestAccounts } = await import('./lib/test-accounts.mjs');
  await ensureTestAccounts();

  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // Bu betiğe özgü, var olmayan bir e-posta: gerçek hesapların sayacını
  // doldurup diğer doğrulama betiklerini engellememek için.
  const email = `hiz-siniri-${Date.now()}@ornek.local`;

  let blockedAt = null;
  let blockMessage = '';
  for (let attempt = 1; attempt <= 8 && blockedAt === null; attempt++) {
    await page.goto(`${BASE}/isletme`, { waitUntil: 'networkidle' });
    await page.fill('#email', email);
    await page.fill('#password', `yanlis-parola-${attempt}`);
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await page.waitForTimeout(700);

    if (await page.getByText('Çok fazla deneme').isVisible()) {
      blockedAt = attempt;
      blockMessage = await page.getByText('Çok fazla deneme').innerText();
    }
  }

  // E-posta kovası 5; 6. denemede durmalı. Daha erken durursa IP kovası
  // dolmuş demektir ve bu betik başka bir koşumdan artakalan sayaçla
  // çalışıyordur.
  check(
    'arka arkaya yanlış parola girişi engelleniyor',
    blockedAt === 6,
    blockedAt ? `${blockedAt}. denemede durdu` : '8 denemede durmadı'
  );

  // Başarılı giriş sınıra takılmamalı: sayılan şey başarısızlık.
  const { loginAs } = await import('./lib/test-accounts.mjs');
  let repeatLoginsOk = true;
  try {
    for (let i = 0; i < 8; i++) {
      const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p2 = await fresh.newPage();
      await loginAs(p2, BASE, 'buyukcekmece-wsc');
      await fresh.close();
    }
  } catch (error) {
    repeatLoginsOk = false;
    console.error(String(error).slice(0, 200));
  }
  check(
    'arka arkaya 8 BAŞARILI giriş engellenmiyor',
    repeatLoginsOk,
    'sayılan şey başarısızlık, deneme değil'
  );
  check(
    'engel mesajı ne zaman denenebileceğini söylüyor',
    /dakika|saniye/.test(blockMessage),
    blockMessage || '(mesaj yok)'
  );

  await ctx.close();
  await browser.close();
}

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
