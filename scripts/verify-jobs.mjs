/**
 * Zamanlanmış iş altyapısının testi.
 *
 * Zamanlayıcı ucu dışarıya açık bir HTTP adresidir; korunmazsa adresi bilen
 * herkes iş tetikleyebilir. Sınananlar:
 *
 *   1. `CRON_SECRET` tanımlı değilse uç TAMAMEN KAPALI — "yapılandırmayı
 *      unutmak" sessiz bir güvenlik açığına dönüşmemeli.
 *   2. Yanlış sır, eksik başlık ve farklı uzunlukta sır reddediliyor.
 *   3. Doğru sır çalışıyor.
 *   4. Yetkisiz cevap, hangi işlerin var olduğunu SIZDIRMIYOR.
 *   5. Kalıcı silme yapan iş, komut satırında varsayılan olarak kuru çalışıyor.
 *
 * Kullanım: npm start & node scripts/verify-jobs.mjs
 *   (sunucu CRON_SECRET=gizli-cron-anahtari ile başlatılmış olmalı)
 */
import { getJob, isAuthorized, listJobs } from '../lib/jobs/index.mjs';
import { db } from '../lib/db/index.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const SECRET = process.env.CRON_SECRET ?? 'gizli-cron-anahtari';

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

// ---------- 1. Sır tanımsızken uç kapalı ----------
//
// Doğrudan modül üzerinden sınanıyor: sunucuyu sırsız yeniden başlatmadan
// bu davranışı görmenin başka yolu yok ve davranış tam olarak burada tanımlı.

const previous = process.env.CRON_SECRET;
delete process.env.CRON_SECRET;

check('CRON_SECRET tanımsızsa doğru sır bile geçmiyor', !isAuthorized(`Bearer ${SECRET}`));
check('CRON_SECRET tanımsızsa boş başlık da geçmiyor', !isAuthorized(null));

process.env.CRON_SECRET = SECRET;

// ---------- 2. Sır karşılaştırması ----------

check('doğru sır kabul ediliyor (Bearer)', isAuthorized(`Bearer ${SECRET}`));
check('doğru sır kabul ediliyor (düz)', isAuthorized(SECRET));
check('yanlış sır reddediliyor', !isAuthorized(`Bearer ${'x'.repeat(SECRET.length)}`));
check('farklı uzunluktaki sır reddediliyor', !isAuthorized('Bearer k'));
check('boş başlık reddediliyor', !isAuthorized(null));
check('boş dizgi reddediliyor', !isAuthorized(''));

if (previous === undefined) delete process.env.CRON_SECRET;
else process.env.CRON_SECRET = previous;

// ---------- 3. Kayıt defteri ----------

check('en az bir iş kayıtlı', listJobs().length >= 1, `${listJobs().length} iş`);
check('bilinmeyen iş bulunamıyor', getJob('yok-boyle-bir-is') === undefined);
check('saklama işi kalıcı silme olarak işaretli', getJob('saklama')?.destructive === true);

// ---------- 4. Kuru çalışma gerçekten silmiyor ----------

const client = await db();

// Kendi kaydımızı yazıyoruz: günlük boşken "hiçbir şey silinmedi" kontrolü
// boşa çalışır ve her zaman geçerdi. Silinmeye ADAY satırlar olmalı ki
// kuru çalışmanın gerçekten dokunmadığı görülebilsin.
const marker = `kuru-calisma-testi-${Date.now()}`;
for (let i = 0; i < 3; i++) {
  await client.run(
    `INSERT INTO audit_log (id, at, actor_type, action, outcome, target_id)
     VALUES (?, ?, 'system', 'operator.login', 'success', ?)`,
    [`${marker}-${i}`, new Date(Date.now() - 10 * 60 * 1000).toISOString(), marker]
  );
}

const before = Number(
  (await client.get('SELECT COUNT(*) AS n FROM audit_log WHERE target_id = ?', [marker])).n
);
check('test kayıtları yazıldı', before === 3, `${before} satır`);

// Saklama süresi 0 güne çekilirse HER kayıt "süresi dolmuş" sayılır; kuru
// çalışmanın gerçekten hiçbir şey silmediğini bu en sert koşulda sınıyoruz.
const originalDays = process.env.AUDIT_RETENTION_DAYS;
process.env.AUDIT_RETENTION_DAYS = '0';

const dry = await getJob('saklama').run({ apply: false });
const afterDry = Number(
  (await client.get('SELECT COUNT(*) AS n FROM audit_log WHERE target_id = ?', [marker])).n
);

check(
  'kuru çalışma tek satır bile silmiyor',
  afterDry === 3,
  `silinmeye aday ${before} satırdan ${afterDry} tanesi duruyor`
);
check(
  'kuru çalışma ne silineceğini bildiriyor',
  dry.details?.applied === false && Number(dry.details?.expiredAudit) >= 3,
  dry.summary
);

// Şimdi gerçekten uygulanınca silinmeli — kuru çalışmanın "silmiyor" iddiası,
// ancak uygulamanın "siliyor" olduğu gösterilirse anlamlı.
const applied = await getJob('saklama').run({ apply: true });
const afterApply = Number(
  (await client.get('SELECT COUNT(*) AS n FROM audit_log WHERE target_id = ?', [marker])).n
);
check(
  'uygulandığında süresi dolan kayıt siliniyor',
  afterApply === 0,
  `${applied.details?.auditDeleted} satır silindi`
);

if (originalDays === undefined) delete process.env.AUDIT_RETENTION_DAYS;
else process.env.AUDIT_RETENTION_DAYS = originalDays;

await client.close();

// ---------- 5. HTTP ucu ----------

let serverUp = false;
try {
  serverUp = (await fetch(`${BASE}/isletme`, { signal: AbortSignal.timeout(3000) })).ok;
} catch {
  serverUp = false;
}

if (!serverUp) {
  console.log('(sunucu ayakta değil — HTTP bölümü atlandı)\n');
} else {
  const call = async (path, header) =>
    fetch(`${BASE}/api/gorevler/${path}`, {
      headers: header ? { authorization: header } : {},
    });

  check('başlıksız istek 401', (await call('saklama')).status === 401);
  check('yanlış sır 401', (await call('saklama', 'Bearer yanlis-sir')).status === 401);
  check('doğru sır 200', (await call('saklama', `Bearer ${SECRET}`)).status === 200);
  check('bilinmeyen iş 404', (await call('yokboyle', `Bearer ${SECRET}`)).status === 404);

  // Yetkisiz cevabın içeriği, sistemde hangi işlerin olduğunu ele vermemeli.
  const denied = await (await call('saklama')).text();
  check(
    'yetkisiz cevap iş adlarını sızdırmıyor',
    !denied.includes('saklama') && !denied.includes('mevcut'),
    denied.slice(0, 80)
  );
}

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
