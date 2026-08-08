/**
 * Otomatik ihlal uyarılarının testi.
 *
 * Sınananlar:
 *   1. Eşiğin ALTINDA kalan olay uyarı ÜRETMEZ — yoksa kurallar gürültü olur.
 *   2. Eşiği aşan olay uyarı üretir.
 *   3. **Aynı olay 50 kez tekrar edince TEK uyarı üretilir.** Uyarı fırtınası
 *      olmaz; garanti `dedupe_key` üzerindeki UNIQUE kısıtı.
 *   4. **12 ayrı süreç aynı anda süpürse bile tek uyarı oluşur.** "Önce bak,
 *      sonra yaz" yarışı yok.
 *   5. **E-posta gövdesinde kişisel veri YOK** — IP, ad, telefon, bilet kodu.
 *   6. Farklı hedefler ayrı uyarı alır; bir işletmeye yapılan saldırı
 *      diğerininkini bastırmaz.
 *   7. Kuru çalışma hiçbir şey yazmaz.
 *   8. Uyarı kapatılınca listeden düşer, kaydı SİLİNMEZ.
 *   9. Yanlış CRON_SECRET ile iş ucu 401 alır.
 *
 * Kullanım:
 *   CRON_SECRET=gizli-cron-anahtari ALERT_EMAIL_TO=guvenlik@ornek.local \
 *     npm start > server.log &
 *   SERVER_LOG=server.log node scripts/verify-alerts.mjs
 *
 * `ALERT_EMAIL_TO` ZORUNLU. Tanımlı değilse uyarılar kaydedilir ama kimseye
 * haber verilemez ve iş bilinçli olarak `ok: false` döner — "uyarı sistemi
 * kurulu ama kimseye ulaşmıyor" hâli sessiz geçilmemeli. Süit bunu HTTP 500
 * olarak görür; sunucu bu değişkenle başlatılmamışsa dört kontrol kalır ve
 * sebebi kodda değil ortamdadır.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db as connect } from '../lib/db/index.mjs';
import { runAlerts, dedupeKey, RULES } from '../lib/alerts/index.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const LOG = process.env.SERVER_LOG;
const SECRET = process.env.CRON_SECRET ?? 'gizli-cron-anahtari';

const execFileAsync = promisify(execFile);
const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const store = await connect();

// Yalnızca bu koşuma ait bir işletme kimliği: gerçek verinin uyarılarıyla
// karışmasın ve testler birbirini etkilemesin.
const suffix = Date.now().toString().slice(-9);
const OPERATOR = `uyaritest-${suffix}`;
const OTHER = `uyaritest-diger-${suffix}`;

const now = new Date();

/**
 * İşlem günlüğüne sahte kayıt yazar.
 *
 * Uygulamanın kendi `record()` fonksiyonu yerine doğrudan yazılıyor: sınanan
 * şey kuralların günlüğü nasıl OKUDUĞU, günlüğün nasıl yazıldığı değil. 20
 * başarısız girişi gerçek giriş formundan yapmak testi dakikalarca sürdürür
 * ve hız sınırına takılırdı.
 */
async function writeAudit({ action, operatorId, actorId, outcome = 'failure', ip = null, at }) {
  await store.run(
    `INSERT INTO audit_log
       (id, at, actor_type, actor_id, operator_id, action, target_type, target_id, outcome, ip, user_agent, meta)
     VALUES (?, ?, 'operator', ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL)`,
    [randomUUID(), at ?? new Date().toISOString(), actorId, operatorId, action, outcome, ip]
  );
}

async function alertsFor(operatorId) {
  return store.all('SELECT * FROM alerts WHERE operator_id = ? ORDER BY at DESC', [operatorId]);
}

// ---------- 1. Eşiğin altı uyarı üretmiyor ----------

{
  // Kural 20'de tetikleniyor; 19 yazıyoruz.
  for (let i = 0; i < 19; i++) {
    await writeAudit({ action: 'operator.login_failed', operatorId: OPERATOR });
  }

  await runAlerts({ now });
  check(
    'eşiğin ALTINDA kalan olay uyarı üretmiyor',
    (await alertsFor(OPERATOR)).length === 0,
    '19 başarısız giriş, eşik 20'
  );
}

// ---------- 2 + 3. Eşik aşılınca tek uyarı, tekrarlarda yine tek ----------

{
  // Yirminci kayıt eşiği aşırıyor.
  await writeAudit({ action: 'operator.login_failed', operatorId: OPERATOR });

  await runAlerts({ now });
  const first = await alertsFor(OPERATOR);
  check('eşik aşılınca uyarı üretiliyor', first.length === 1, `${first.length} uyarı`);
  check(
    'uyarı doğru kuralı ve önem derecesini taşıyor',
    first[0]?.rule === 'giris-yogunlugu' && first[0]?.severity === 'critical',
    `${first[0]?.rule} / ${first[0]?.severity}`
  );

  // Saldırı devam ediyor: 50 kayıt daha ve 50 süpürme.
  for (let i = 0; i < 50; i++) {
    await writeAudit({ action: 'operator.login_failed', operatorId: OPERATOR });
    await runAlerts({ now });
  }

  const after = await alertsFor(OPERATOR);
  check(
    'aynı olay 50 kez tekrar edince YİNE TEK uyarı var',
    after.length === 1,
    `${after.length} uyarı — uyarı fırtınası yok`
  );
}

// ---------- 6. Farklı hedef ayrı uyarı alıyor ----------

{
  for (let i = 0; i < 20; i++) {
    await writeAudit({ action: 'operator.login_failed', operatorId: OTHER });
  }
  await runAlerts({ now });

  check(
    'başka işletmeye yapılan saldırı KENDİ uyarısını üretiyor',
    (await alertsFor(OTHER)).length === 1,
    'bir hedefin uyarısı diğerini bastırmıyor'
  );
}

// ---------- 4. 12 eşzamanlı süpürme ----------

{
  const raceOperator = `uyaritest-yaris-${suffix}`;
  for (let i = 0; i < 25; i++) {
    await writeAudit({ action: 'operator.login_failed', operatorId: raceOperator });
  }

  const dir = mkdtempSync(join(tmpdir(), 'rastla-uyari-'));
  const worker = join(dir, 'sweep.mjs');
  writeFileSync(
    worker,
    `import { runAlerts } from ${JSON.stringify(new URL('../lib/alerts/index.mjs', import.meta.url).href)};
import { db } from ${JSON.stringify(new URL('../lib/db/index.mjs', import.meta.url).href)};
const result = await runAlerts({ now: new Date(${now.getTime()}) });
// İşaretli satır: yarışı KAZANAN süreç aynı zamanda e-postayı gönderen
// süreçtir ve konsol posta sağlayıcısı stdout'a yazar. Çıplak sayı
// yazılınca kazananın çıktısı posta satırlarıyla karışıp NaN oluyordu —
// yani tam da kanıtlaması gereken süreç sayılamıyordu.
process.stdout.write('\\nRASTLA_SONUC:' + result.created + '\\n');
await (await db()).close();
`
  );

  // Ayrı süreçler: aynı olay döngüsünde denemek gerçek yarışı üretmez.
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      execFileAsync(process.execPath, [worker], { encoding: 'utf8', timeout: 60000 })
        .then((r) => {
          const line = r.stdout.match(/RASTLA_SONUC:(-?\d+)/);
          return line ? Number(line[1]) : Number.NaN;
        })
        .catch(() => -1)
    )
  );
  rmSync(dir, { recursive: true, force: true });

  const winners = results.filter((n) => n >= 1).length;
  const stored = await alertsFor(raceOperator);

  check(
    '12 eşzamanlı süpürmeden yalnızca BİRİ uyarıyı oluşturuyor',
    winners === 1,
    `kazanan: ${winners}, sonuçlar: ${results.join(',')}`
  );
  check(
    'yarış sonunda veritabanında tek uyarı var',
    stored.length === 1,
    `${stored.length} uyarı`
  );
}

// ---------- Tekilleştirme anahtarı zaman kovası taşıyor ----------

{
  const sameHour = new Date('2026-08-07T10:15:00Z');
  const laterSameHour = new Date('2026-08-07T10:59:00Z');
  const nextHour = new Date('2026-08-07T11:01:00Z');

  check(
    'aynı saatteki iki olay aynı tekilleştirme anahtarını alıyor',
    dedupeKey('k', 'h', sameHour) === dedupeKey('k', 'h', laterSameHour),
    dedupeKey('k', 'h', sameHour)
  );
  check(
    'sonraki saat YENİ uyarıya izin veriyor',
    dedupeKey('k', 'h', sameHour) !== dedupeKey('k', 'h', nextHour),
    'bekleme süresi bedavaya geliyor, sonsuza kadar susturmuyor'
  );
}

// ---------- 5. E-posta gövdesinde kişisel veri yok ----------

{
  const mailOperator = `uyaritest-posta-${suffix}`;
  const secretIp = '203.0.113.77';
  const secretActor = `gizli-personel-${suffix}`;

  for (let i = 0; i < 20; i++) {
    await writeAudit({
      action: 'operator.login_failed',
      operatorId: mailOperator,
      actorId: secretActor,
      ip: secretIp,
    });
  }

  const before = LOG && existsSync(LOG) ? readFileSync(LOG, 'utf8').length : 0;

  // Posta konsol sağlayıcısına düşsün diye iş HTTP ucundan çağrılıyor;
  // sunucunun günlüğüne yazılan gövde okunacak.
  const response = await fetch(`${BASE}/api/gorevler/uyarilar`, {
    headers: { authorization: `Bearer ${SECRET}` },
  });
  check('uyarı işi çalışıyor', response.status === 200, `HTTP ${response.status}`);

  if (LOG && existsSync(LOG)) {
    const fresh = readFileSync(LOG, 'utf8').slice(before);
    const mailBlocks = fresh
      .split('\n')
      .filter((line) => line.includes('[mail:console]') || line.includes('kural:'));
    const body = fresh.slice(fresh.indexOf('[mail:console]'));

    check('uyarı e-postası gönderiliyor', mailBlocks.length > 0 || body.length > 0, 'konsol sağlayıcısı');
    check(
      'e-posta gövdesinde IP ADRESİ yok',
      !body.includes(secretIp),
      body.includes(secretIp) ? 'IP sızdı!' : 'temiz'
    );
    check(
      'e-posta gövdesinde hesap kimliği yok',
      !body.includes(secretActor),
      body.includes(secretActor) ? 'kimlik sızdı!' : 'temiz'
    );
    check(
      'e-posta günlüğe yönlendiriyor',
      body.includes('/isletme/gunluk'),
      'nerede bakılacağını söylüyor'
    );
  }

  // Uyarının KENDİSİ de IP taşımamalı: e-posta temiz olsa bile tablo
  // kirliyse bir sonraki ekran onu gösterirdi.
  const rows = await store.all('SELECT details FROM alerts WHERE operator_id = ?', [mailOperator]);
  check(
    'uyarı kaydında da IP adresi yok',
    !rows.some((r) => String(r.details ?? '').includes(secretIp)),
    'kişisel veri ikinci bir tabloya kopyalanmıyor'
  );

  const notified = await store.get(
    'SELECT notified_at FROM alerts WHERE operator_id = ? ORDER BY at DESC',
    [mailOperator]
  );
  check('haber verilen uyarı işaretleniyor', Boolean(notified?.notified_at), notified?.notified_at);
}

// ---------- 7. Kuru çalışma yazmıyor ----------

{
  const dryOperator = `uyaritest-kuru-${suffix}`;
  for (let i = 0; i < 20; i++) {
    await writeAudit({ action: 'operator.login_failed', operatorId: dryOperator });
  }

  const dry = await runAlerts({ apply: false, now });
  check('kuru çalışma bulguyu görüyor', dry.found > 0, `${dry.found} bulgu`);
  check('kuru çalışma HİÇBİR ŞEY yazmıyor', (await alertsFor(dryOperator)).length === 0);
}

// ---------- 8. Kapatma listeden düşürüyor, silmiyor ----------

{
  const open = await store.get('SELECT * FROM alerts WHERE operator_id = ?', [OPERATOR]);

  await store.run(
    `UPDATE alerts SET resolved_at = ?, resolved_by = 'test' WHERE id = ? AND resolved_at IS NULL`,
    [new Date().toISOString(), open.id]
  );

  const stillThere = await store.get('SELECT * FROM alerts WHERE id = ?', [open.id]);
  check('kapatılan uyarının kaydı SİLİNMİYOR', Boolean(stillThere), 'kim ne zaman fark etti sorusu cevaplanabilir');
  check('kapatılan uyarı kapanmış işaretli', Boolean(stillThere?.resolved_at));

  const { listOpenAlerts } = await import('../lib/alerts/index.mjs');
  const openList = await listOpenAlerts(OPERATOR);
  check(
    'kapatılan uyarı açık listede görünmüyor',
    !openList.some((a) => a.id === open.id),
    `${openList.length} açık uyarı`
  );
}

// ---------- 9. Yetkisiz istek ----------

{
  const wrong = await fetch(`${BASE}/api/gorevler/uyarilar`, {
    headers: { authorization: 'Bearer yanlis-anahtar' },
  });
  check('yanlış CRON_SECRET 401 alıyor', wrong.status === 401, `HTTP ${wrong.status}`);

  const none = await fetch(`${BASE}/api/gorevler/uyarilar`);
  check('başlıksız istek 401 alıyor', none.status === 401, `HTTP ${none.status}`);
}

// ---------- Kurallar gözden geçirilebilir mi ----------

{
  check(
    'kuralların hepsinin kimliği ve açıklaması var',
    RULES.every((r) => r.id && r.description && r.windowMinutes > 0),
    `${RULES.length} kural`
  );
  check(
    'kural kimlikleri benzersiz',
    new Set(RULES.map((r) => r.id)).size === RULES.length
  );
}

// ------------------------------------------------------------------ temizlik

for (const id of [OPERATOR, OTHER]) {
  await store.run('DELETE FROM alerts WHERE operator_id = ?', [id]);
  await store.run('DELETE FROM audit_log WHERE operator_id = ?', [id]);
}
await store.run(`DELETE FROM alerts WHERE operator_id LIKE ?`, [`uyaritest-%${suffix}`]);
await store.run(`DELETE FROM audit_log WHERE operator_id LIKE ?`, [`uyaritest-%${suffix}`]);

console.log('\nOTOMATİK UYARI DOĞRULAMASI\n');
for (const { name, pass, detail } of checks) {
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti.\n`);

await store.close();
process.exit(failed === 0 ? 0 : 1);
