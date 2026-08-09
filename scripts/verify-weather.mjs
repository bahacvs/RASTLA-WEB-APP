/**
 * Hava durumu, müşteri bildirimi ve yeniden planlamanın testi.
 *
 * Hava, su sporlarında en sık iptal sebebi ve bu özellik yanlış çalıştığında
 * iki farklı biçimde zarar veriyor: ya olmayan bir riski uydurup dolu bir günü
 * iptal ettiriyor, ya da gerçek bir riski sessizce geçiştiriyor. İkisi de
 * "hava uyarısı yok" durumundan kötü.
 *
 * Sınananlar:
 *   1. Eşiğin altındaki gün `uygun`, %80'ini aşan `riskli`, aşan `elverissiz`.
 *   2. Eşik tanımlanmamışsa ölçüm ne olursa olsun `uygun` — NULL "kontrol yok".
 *   3. **Sağlayıcı veri döndürmezse hiçbir şey işaretlenmiyor** ve var olan
 *      tahmin EZİLMİYOR. "Ölçemedik" ile "ölçtük, sorun yok" ayrı şeyler;
 *      ikisini karıştırmak, veri gelmediği için susan bir sistemi "her şey
 *      yolunda" diyen bir sisteme çevirirdi. Servisin hata vermesi ve boş
 *      dönmesi AYRI AYRI sınanıyor.
 *   4. İş iki kez koşturulunca aynı gün için TEK satır kalıyor (UNIQUE).
 *   5. Hiçbir rezervasyon otomatik iptal EDİLMİYOR: iş yalnızca işaretliyor.
 *   6. İptal müşteriye bildirim üretiyor — bu, sistemde müşteriye giden ilk
 *      işlem bildirimi ve öncesinde panel "misafirleri siz arayın" diyordu.
 *   7. Yeniden planlama kapasiteyi doğru taşıyor: yeni slot doluyor, eski
 *      boşalıyor, toplam tutulan yer DEĞİŞMİYOR.
 *   8. **12 AYRI SÜREÇ aynı rezervasyonu aynı anda taşımaya çalıştığında tam
 *      olarak biri geçiyor** ve toplam tutulan yer bozulmuyor.
 *   9. Dolu bir slota taşıma reddediliyor ve rezervasyon ESKİ yerinde kalıyor.
 *
 * Eşzamanlılık iddiaları AYRI İŞLETİM SİSTEMİ SÜREÇLERİYLE sınanıyor: aynı
 * süreçte `Promise.all` tek olay döngüsünde çalışır ve gerçek yarış üretmez.
 *
 * Sunucuya ihtiyaç duymuyor; hepsi izole bir veritabanında gerçek kod
 * yollarından geçiyor.
 *
 * Kullanım:
 *   node scripts/verify-weather.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { judge } from '../lib/weather/index.mjs';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

// =====================================================================
// BÖLÜM A — Karar: ölçüm + eşik → hüküm
// =====================================================================
//
// Saf fonksiyon; veritabanı yok. Karar burada olduğu için sağlayıcının
// değişmesi bu bölümü etkilemiyor.

const LIMITS = { windLimitKmh: 30, gustLimitKmh: 45, waveLimitM: 1.0 };
const measure = (wind, gust = null, wave = null) => ({
  date: '2026-07-01',
  windKmh: wind,
  gustKmh: gust,
  waveM: wave,
  precipitationMm: null,
});

check('eşiğin altındaki rüzgâr uygun', judge(measure(10), LIMITS).verdict === 'uygun');
check(
  'eşiğin %80’ini aşan rüzgâr RİSKLİ olarak işaretleniyor',
  judge(measure(25), LIMITS).verdict === 'riskli',
  `25 km/s, sınır 30`
);
check('eşiği aşan rüzgâr elverişsiz', judge(measure(35), LIMITS).verdict === 'elverissiz');
check(
  'tam eşikteki değer elverişsiz sayılıyor — sınır dahil',
  judge(measure(30), LIMITS).verdict === 'elverissiz'
);
check(
  'gerekçe hangi ölçümün aştığını YAZIYOR',
  /Rüzgâr 35/.test(judge(measure(35), LIMITS).reason ?? ''),
  judge(measure(35), LIMITS).reason
);
check(
  'dalga tek başına elverişsiz yapabiliyor — rüzgâr uygunken',
  judge(measure(5, 5, 1.4), LIMITS).verdict === 'elverissiz'
);

// Eşiksiz aktivite: hiçbir ölçüm hüküm doğurmuyor.
const NO_LIMITS = { windLimitKmh: null, gustLimitKmh: null, waveLimitM: null };
check(
  'eşik tanımlanmamışsa fırtına bile uygun — NULL "kontrol yok" demek',
  judge(measure(120, 180, 6), NO_LIMITS).verdict === 'uygun'
);
check(
  'ölçüm yoksa eşik varken de uygun — karar boşluğu burada DOLDURULMUYOR',
  judge(measure(null, null, null), LIMITS).verdict === 'uygun'
);

// =====================================================================
// BÖLÜM B — İş: yazma, tekrar çalıştırma, veri yokluğu
// =====================================================================
//
// Ayrı süreçte çalışıyor çünkü `lib/db/index.mjs` bağlantıyı tekil olarak
// önbelleğe alıyor; burada bir veritabanı açıp kapatmak Bölüm C'yi bozardı.
// `node -e` proje dizininden çağrılıyor ki better-sqlite3 çözülebilsin.

const dir = mkdtempSync(join(tmpdir(), 'rastla-weather-'));

const jobWorker = `
process.env.DATABASE_PATH = process.argv[1];
delete process.env.DATABASE_URL;
process.env.WEATHER_PROVIDER = 'fake';

const { db } = await import('./lib/db/index.mjs');
const { runWeather } = await import('./lib/weather/job.mjs');
const { getForecast } = await import('./lib/db/weather.mjs');

const client = await db();
const now = new Date().toISOString();
await client.run("INSERT INTO operators (id,name,contact_email,created_at) VALUES ('op','Test','op@example.com',?)", [now]);
await client.run(
  \`INSERT INTO activities (id,operator_id,slug,title,category,price_try,duration_minutes,
      location_name,lat,lng,capacity_mode,wind_limit_kmh,status,created_at)
    VALUES ('act','op','t','Test','jet-ski',100,30,'Sahil',41.0,28.5,'per_person',30,'published',?)\`,
  [now]
);
// Eşiksiz ikinci aktivite: iş bunu HİÇ sormamalı.
await client.run(
  \`INSERT INTO activities (id,operator_id,slug,title,category,price_try,duration_minutes,
      location_name,lat,lng,capacity_mode,status,created_at)
    VALUES ('act2','op','t2','Eşiksiz','tekne',100,30,'Sahil',41.0,28.5,'per_person','published',?)\`,
  [now]
);

const out = {};

// --- 1. koşu: eşiği aşan rüzgâr
process.env.WEATHER_FAKE = 'wind=45';
const first = await runWeather();
out.aktiviteSayisi = first.activities;
out.elverissiz = first.unsuitable;

const row1 = await client.get("SELECT * FROM weather_forecasts WHERE activity_id='act' ORDER BY forecast_date LIMIT 1");
out.ilkHuküm = row1.verdict;
out.ilkRuzgar = Number(row1.wind_kmh);

// --- 2. koşu: aynı veri, tekrar. Satır ÇOĞALMAMALI.
await runWeather();
out.satirSayisi = Number(
  (await client.get("SELECT COUNT(*) AS n FROM weather_forecasts WHERE activity_id='act' AND forecast_date=?", [row1.forecast_date])).n
);

// --- 3. koşu: sağlayıcı HATA veriyor. Var olan tahmin EZİLMEMELİ.
process.env.WEATHER_FAKE = 'hata';
const errored = await runWeather();
const afterError = await getForecast('act', row1.forecast_date);
out.hataSonrasiHuküm = afterError.verdict;
out.hataSonrasiRuzgar = afterError.windKmh;
out.hataYazdi = errored.written;

// --- 4. koşu: sağlayıcı BOŞ dönüyor. Yine ezilmemeli.
process.env.WEATHER_FAKE = 'bos';
const empty = await runWeather();
const afterEmpty = await getForecast('act', row1.forecast_date);
out.bosSonrasiHuküm = afterEmpty.verdict;
out.bosYazdi = empty.written;

// --- Eşiksiz aktivite hiç sorulmadı mı?
out.esiksizSatir = Number(
  (await client.get("SELECT COUNT(*) AS n FROM weather_forecasts WHERE activity_id='act2'")).n
);

// --- Sağlayıcı kapalıyken hiçbir şey yazılmıyor mu?
out.kapaliYazdi = null;

process.stdout.write('RASTLA_SONUC:' + JSON.stringify(out));
`;

const jobRun = await execFileAsync(
  process.execPath,
  ['--experimental-strip-types', '--no-warnings', '-e', jobWorker, join(dir, 'job.db')],
  { encoding: 'utf8', cwd: process.cwd() }
);

const job = JSON.parse(jobRun.stdout.split('RASTLA_SONUC:')[1]);

check(
  'yalnızca EŞİĞİ OLAN aktiviteler için tahmin çekiliyor',
  job.aktiviteSayisi === 1 && job.esiksizSatir === 0,
  `sorulan ${job.aktiviteSayisi}, eşiksiz aktivitenin satırı ${job.esiksizSatir}`
);
check(
  'eşiği aşan gün elverişsiz yazılıyor',
  job.ilkHuküm === 'elverissiz' && job.ilkRuzgar === 45,
  `${job.ilkHuküm} @ ${job.ilkRuzgar} km/s`
);
check(
  'iş İKİ KEZ koşturulunca aynı gün için tek satır kalıyor',
  job.satirSayisi === 1,
  `satır: ${job.satirSayisi}`
);
check(
  'sağlayıcı HATA verdiğinde hiçbir şey yazılmıyor ve eldeki tahmin korunuyor',
  job.hataYazdi === 0 && job.hataSonrasiHuküm === 'elverissiz' && job.hataSonrasiRuzgar === 45,
  `yazılan ${job.hataYazdi}, hüküm ${job.hataSonrasiHuküm}`
);
check(
  'sağlayıcı BOŞ döndüğünde de eldeki tahmin korunuyor',
  job.bosYazdi === 0 && job.bosSonrasiHuküm === 'elverissiz',
  `yazılan ${job.bosYazdi}, hüküm ${job.bosSonrasiHuküm}`
);

// ---------- Sağlayıcı kapalı: hiçbir satır yazılmıyor ----------

const offWorker = `
process.env.DATABASE_PATH = process.argv[1];
delete process.env.DATABASE_URL;
process.env.WEATHER_PROVIDER = 'none';

const { db } = await import('./lib/db/index.mjs');
const { runWeather } = await import('./lib/weather/job.mjs');

const client = await db();
const now = new Date().toISOString();
await client.run("INSERT INTO operators (id,name,created_at) VALUES ('op','Test',?)", [now]);
await client.run(
  \`INSERT INTO activities (id,operator_id,slug,title,category,price_try,duration_minutes,
      location_name,lat,lng,capacity_mode,wind_limit_kmh,status,created_at)
    VALUES ('act','op','t','Test','jet-ski',100,30,'Sahil',41.0,28.5,'per_person',30,'published',?)\`,
  [now]
);

await runWeather();
const n = Number((await client.get('SELECT COUNT(*) AS n FROM weather_forecasts')).n);
process.stdout.write('RASTLA_SONUC:' + JSON.stringify({ satir: n }));
`;

const offRun = await execFileAsync(
  process.execPath,
  ['--experimental-strip-types', '--no-warnings', '-e', offWorker, join(dir, 'off.db')],
  { encoding: 'utf8', cwd: process.cwd() }
);
const off = JSON.parse(offRun.stdout.split('RASTLA_SONUC:')[1]);
check(
  'WEATHER_PROVIDER=none ile hiçbir satır yazılmıyor',
  off.satir === 0,
  `satır: ${off.satir}`
);

// ---------- Elverişsiz gün rezervasyonu İPTAL ETMİYOR ----------

const noCancelWorker = `
process.env.DATABASE_PATH = process.argv[1];
delete process.env.DATABASE_URL;
process.env.WEATHER_PROVIDER = 'fake';
process.env.WEATHER_FAKE = 'wind=90';

const { db } = await import('./lib/db/index.mjs');
const { runWeather } = await import('./lib/weather/job.mjs');

const client = await db();
const now = new Date().toISOString();
const today = new Date().toISOString().slice(0, 10);

await client.run("INSERT INTO operators (id,name,contact_email,created_at) VALUES ('op','Test','op@example.com',?)", [now]);
await client.run("INSERT INTO users (id,phone,name,created_at) VALUES ('u','905550000001','Test',?)", [now]);
await client.run(
  \`INSERT INTO activities (id,operator_id,slug,title,category,price_try,duration_minutes,
      location_name,lat,lng,capacity_mode,wind_limit_kmh,status,created_at)
    VALUES ('act','op','t','Test','jet-ski',100,30,'Sahil',41.0,28.5,'per_person',30,'published',?)\`,
  [now]
);
await client.run(
  \`INSERT INTO slots (id,activity_id,slot_date,slot_time,capacity,booked,status,created_at)
    VALUES ('s1','act',?, '10:00',6,2,'open',?)\`, [today, now]
);
await client.run(
  \`INSERT INTO bookings (id,code,user_id,activity_slug,operator_id,slot_id,units,
      booking_date,booking_time,adults,children,total_try,status,created_at)
    VALUES ('b','KOD','u','t','op','s1',2,?, '10:00',2,0,200,'confirmed',?)\`, [today, now]
);

const result = await runWeather();
const booking = await client.get("SELECT status FROM bookings WHERE id='b'");
const slot = await client.get("SELECT booked FROM slots WHERE id='s1'");

process.stdout.write('RASTLA_SONUC:' + JSON.stringify({
  durum: booking.status,
  tutulan: slot.booked,
  bildirim: result.notified,
}));
`;

const noCancelRun = await execFileAsync(
  process.execPath,
  ['--experimental-strip-types', '--no-warnings', '-e', noCancelWorker, join(dir, 'nocancel.db')],
  { encoding: 'utf8', cwd: process.cwd() }
);
const noCancel = JSON.parse(noCancelRun.stdout.split('RASTLA_SONUC:')[1]);

check(
  'elverişsiz gün rezervasyonu OTOMATİK İPTAL ETMİYOR',
  noCancel.durum === 'confirmed' && noCancel.tutulan === 2,
  `durum ${noCancel.durum}, tutulan ${noCancel.tutulan}`
);
check(
  'rezervasyonu olan elverişsiz gün için işletmeye bildirim gidiyor',
  noCancel.bildirim === 1,
  `bildirim: ${noCancel.bildirim}`
);

// =====================================================================
// BÖLÜM C — Yeniden planlama: kapasite ve yarış
// =====================================================================

const moveWorker = `
process.env.DATABASE_PATH = process.argv[1];
delete process.env.DATABASE_URL;

const { db } = await import('./lib/db/index.mjs');
const { rescheduleBooking } = await import('./lib/db/reschedule.mjs');

const client = await db();
const now = new Date().toISOString();
const day = '2026-09-01';

await client.run("INSERT INTO operators (id,name,created_at) VALUES ('op','Test',?)", [now]);
await client.run("INSERT INTO users (id,phone,name,created_at) VALUES ('u','905550000002','Test',?)", [now]);
await client.run(
  \`INSERT INTO activities (id,operator_id,slug,title,category,price_try,duration_minutes,
      location_name,capacity_mode,status,created_at)
    VALUES ('act','op','t','Test','jet-ski',100,30,'Sahil','per_person','published',?)\`, [now]
);
// Başka bir aktivitenin slotu: taşıma buraya İZİN VERMEMELİ.
await client.run(
  \`INSERT INTO activities (id,operator_id,slug,title,category,price_try,duration_minutes,
      location_name,capacity_mode,status,created_at)
    VALUES ('act2','op','t2','Baska','tekne',100,30,'Sahil','per_person','published',?)\`, [now]
);

const slot = (id, time, capacity, booked, activity = 'act') =>
  client.run(
    \`INSERT INTO slots (id,activity_id,slot_date,slot_time,capacity,booked,status,created_at)
      VALUES (?,?,?,?,?,?,'open',?)\`, [id, activity, day, time, capacity, booked, now]
  );

await slot('s1', '10:00', 6, 2);   // rezervasyonun bulunduğu yer
await slot('s2', '11:00', 6, 0);   // boş hedef
await slot('s3', '12:00', 2, 2);   // DOLU hedef
await slot('s4', '13:00', 6, 0, 'act2'); // başka aktivite

await client.run(
  \`INSERT INTO bookings (id,code,user_id,activity_slug,operator_id,slot_id,units,
      booking_date,booking_time,adults,children,total_try,status,created_at)
    VALUES ('b','KOD1','u','t','op','s1',2,?, '10:00',2,0,200,'confirmed',?)\`, [day, now]
);

const out = {};
const booked = async (id) => Number((await client.get('SELECT booked FROM slots WHERE id=?', [id])).booked);
const total = async () => Number((await client.get('SELECT SUM(booked) AS n FROM slots')).n);

out.baslangicToplam = await total();

// --- Dolu slota taşıma reddediliyor, rezervasyon eski yerinde kalıyor.
const full = await rescheduleBooking('KOD1', 's3');
out.doluRet = full.ok === false ? full.reason : 'gecti';
out.doluSonrasiSlot = (await client.get("SELECT slot_id FROM bookings WHERE id='b'")).slot_id;
out.doluSonrasiToplam = await total();

// --- Başka aktiviteye taşıma reddediliyor.
const other = await rescheduleBooking('KOD1', 's4');
out.baskaAktiviteRet = other.ok === false ? other.reason : 'gecti';

// --- Geçerli taşıma.
const moved = await rescheduleBooking('KOD1', 's2');
out.tasindi = moved.ok;
out.eski = await booked('s1');
out.yeni = await booked('s2');
out.sonToplam = await total();

const row = await client.get("SELECT slot_id, booking_time, rescheduled_at FROM bookings WHERE id='b'");
out.yeniSlot = row.slot_id;
out.yeniSaat = row.booking_time;
out.damga = row.rescheduled_at !== null;

process.stdout.write('RASTLA_SONUC:' + JSON.stringify(out));
`;

const moveDb = join(dir, 'move.db');
const moveRun = await execFileAsync(
  process.execPath,
  ['--experimental-strip-types', '--no-warnings', '-e', moveWorker, moveDb],
  { encoding: 'utf8', cwd: process.cwd() }
);
const move = JSON.parse(moveRun.stdout.split('RASTLA_SONUC:')[1]);

check(
  'dolu slota taşıma REDDEDİLİYOR',
  move.doluRet === 'full',
  `sonuç: ${move.doluRet}`
);
check(
  'reddedilen taşımadan sonra rezervasyon ESKİ yerinde ve kapasite bozulmamış',
  move.doluSonrasiSlot === 's1' && move.doluSonrasiToplam === move.baslangicToplam,
  `slot ${move.doluSonrasiSlot}, toplam ${move.doluSonrasiToplam}`
);
check(
  'başka bir aktivitenin slotuna taşınamıyor',
  move.baskaAktiviteRet === 'other_activity',
  `sonuç: ${move.baskaAktiviteRet}`
);
check(
  'geçerli taşıma rezervasyonu yeni saate alıyor',
  move.tasindi === true && move.yeniSlot === 's2' && move.yeniSaat === '11:00',
  `${move.yeniSlot} @ ${move.yeniSaat}`
);
check(
  'taşımadan sonra eski slot boşalıyor, yeni slot doluyor',
  move.eski === 0 && move.yeni === 2,
  `eski ${move.eski}, yeni ${move.yeni}`
);
check(
  'TOPLAM tutulan yer taşımadan sonra DEĞİŞMİYOR — ne kaybolan ne çoğalan yer',
  move.sonToplam === move.baslangicToplam,
  `${move.baslangicToplam} → ${move.sonToplam}`
);
check('taşınan rezervasyon damgalanıyor', move.damga === true);

// ---------- GERÇEK YARIŞ: 12 süreç, tek rezervasyon ----------
//
// İşletme paneli iki sekmede açıksa ya da düğmeye iki kez basılırsa aynı
// rezervasyon iki kez taşınmaya çalışılır. Kazananı belirleyen tek şey
// `slot_id = <eski>` koşulu: "önce oku, sonra taşı" yazılsaydı 12 sürecin
// hepsi aynı eski slotu görür, hepsi hedefte yer tutar ve rezervasyon bir
// yerdeyken kapasite on iki yerde tutulmuş olurdu.

const raceDb = join(dir, 'race.db');
{
  const setup = new Database(raceDb);
  setup.exec(readFileSync(join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8'));
  setup.pragma('busy_timeout = 10000');
  const now = new Date().toISOString();
  const day = '2026-09-01';

  setup.prepare("INSERT INTO operators (id,name,created_at) VALUES ('op','Test',?)").run(now);
  setup.prepare("INSERT INTO users (id,phone,name,created_at) VALUES ('u','905550000003','Test',?)").run(now);
  setup
    .prepare(
      `INSERT INTO activities (id,operator_id,slug,title,category,price_try,duration_minutes,
         location_name,capacity_mode,status,created_at)
       VALUES ('act','op','t','Test','jet-ski',100,30,'Sahil','per_person','published',?)`
    )
    .run(now);

  const slot = setup.prepare(
    `INSERT INTO slots (id,activity_id,slot_date,slot_time,capacity,booked,status,created_at)
     VALUES (?,'act',?,?,20,?, 'open',?)`
  );
  slot.run('s1', day, '10:00', 2, now);
  slot.run('s2', day, '11:00', 0, now);

  setup
    .prepare(
      `INSERT INTO bookings (id,code,user_id,activity_slug,operator_id,slot_id,units,
         booking_date,booking_time,adults,children,total_try,status,created_at)
       VALUES ('b','KODRACE','u','t','op','s1',2,?,'10:00',2,0,200,'confirmed',?)`
    )
    .run(day, now);
  setup.close();
}

const raceWorker = `
process.env.DATABASE_PATH = process.argv[1];
delete process.env.DATABASE_URL;
process.env.SQLITE_BUSY_TIMEOUT = '10000';

const { rescheduleBooking } = await import('./lib/db/reschedule.mjs');
const result = await rescheduleBooking('KODRACE', 's2');
process.stdout.write(result.ok ? '1' : '0');
`;

const raceResults = await Promise.all(
  Array.from({ length: 12 }, () =>
    execFileAsync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', '-e', raceWorker, raceDb],
      { encoding: 'utf8', cwd: process.cwd() }
    )
      .then((r) => Number(r.stdout.trim()))
      .catch(() => -1)
  )
);

const winners = raceResults.filter((n) => n === 1).length;
check(
  '12 eşzamanlı taşıma denemesinden TAM OLARAK biri geçiyor',
  winners === 1,
  `geçen: ${winners} (${raceResults.join(',')})`
);

{
  const after = new Database(raceDb);
  const s1 = after.prepare("SELECT booked FROM slots WHERE id='s1'").get().booked;
  const s2 = after.prepare("SELECT booked FROM slots WHERE id='s2'").get().booked;
  const row = after.prepare("SELECT slot_id FROM bookings WHERE id='b'").get();
  after.close();

  check(
    'yarış sonunda toplam tutulan yer DEĞİŞMEMİŞ',
    s1 + s2 === 2,
    `s1 ${s1} + s2 ${s2}`
  );
  check(
    'yarış sonunda rezervasyon TEK bir slotta ve orada yer tutulmuş',
    row.slot_id === 's2' && s2 === 2 && s1 === 0,
    `slot ${row.slot_id}, s1 ${s1}, s2 ${s2}`
  );
}

// =====================================================================
// BÖLÜM D — Müşteri bildirimi
// =====================================================================
//
// Bu, sistemde müşteriye giden İLK işlem bildirimi. Öncesinde iptal ekranı
// kelimesi kelimesine "Misafirleri bilgilendirmeyi unutmayın" diyordu; hava
// operasyonu bunsuz yarım kalır — iptal edilen bir günden habersiz müşteri
// yine iskeleye gelir.

const notifyWorker = `
process.env.DATABASE_PATH = process.argv[1];
delete process.env.DATABASE_URL;
process.env.SMS_PROVIDER = 'console';

const { db } = await import('./lib/db/index.mjs');
const { notifyCancellation } = await import('./lib/notify.mjs');

const client = await db();
const now = new Date().toISOString();

await client.run("INSERT INTO users (id,phone,name,created_at) VALUES ('u','905550000004','Test',?)", [now]);
// Silinmiş hesap: \`deleteUser\` telefonu geri döndürülemez bir yer tutucuyla
// değiştiriyor. Oraya mesaj göndermek, sağlayıcıya numara olmayan bir dizgi
// yollamak olurdu.
await client.run(
  "INSERT INTO users (id,phone,name,created_at,deleted_at) VALUES ('u2','silinmis-u2','Silinmiş hesap',?,?)",
  [now, now]
);

// Rezervasyon nesnesi elle kuruluyor: burada sınanan şey iptalin kendisi değil
// (o \`verify-capacity\` ve bu dosyanın C bölümünde), bildirimin kime gidip
// kime gitmediği. \`lib/db/bookings.ts\` düğümden yüklenemiyor (tarayıcıyla
// paylaşılan modülü \`@/\` takma adıyla içe aktarıyor).
const booking = (userId) => ({
  userId,
  code: 'KODC',
  bookingDate: '2026-09-01',
  bookingTime: '10:00',
});

const out = {};
out.gonderildi = (await notifyCancellation(booking('u'), true)).sent;
out.silinmisHesabaGonderildi = (await notifyCancellation(booking('u2'), true)).sent;
out.olmayanHesabaGonderildi = (await notifyCancellation(booking('yok'), true)).sent;

process.stdout.write('RASTLA_SONUC:' + JSON.stringify(out));
`;

const notifyRun = await execFileAsync(
  process.execPath,
  ['--experimental-strip-types', '--no-warnings', '-e', notifyWorker, join(dir, 'notify.db')],
  { encoding: 'utf8', cwd: process.cwd() }
);
const notify = JSON.parse(notifyRun.stdout.split('RASTLA_SONUC:')[1]);

check('iptal edilen rezervasyonun müşterisine bildirim gidiyor', notify.gonderildi === true);
check(
  'SİLİNMİŞ hesaba bildirim GİTMİYOR — orada bir numara değil, yer tutucu var',
  notify.silinmisHesabaGonderildi === false
);
check(
  'olmayan hesap bildirim gönderimini ÇÖKERTMİYOR',
  notify.olmayanHesabaGonderildi === false
);

// Mesaj içeriği: ticari ileti olmamalı.
const { bookingCancelledMessage, bookingRescheduledMessage } = await import(
  '../lib/sms/messages.ts'
);
const cancelText = bookingCancelledMessage({
  code: 'ABCD',
  date: '2026-09-01',
  time: '10:00',
  weather: true,
});
check(
  'iptal mesajı hava sebebini söylüyor ve kodu taşıyor',
  /hava kosullari/.test(cancelText) && /ABCD/.test(cancelText),
  cancelText
);
check(
  'iptal mesajında pazarlama cümlesi YOK — işlem bildirimi ticari iletiye dönüşmemeli',
  !/(kampanya|indirim|takip|firsat|hemen)/i.test(cancelText)
);
check(
  'taşıma mesajı hem eski hem yeni saati yazıyor',
  /10:00/.test(
    bookingRescheduledMessage({
      code: 'ABCD',
      fromDate: '2026-09-01',
      fromTime: '10:00',
      toDate: '2026-09-01',
      toTime: '14:00',
    })
  ) &&
    /14:00/.test(
      bookingRescheduledMessage({
        code: 'ABCD',
        fromDate: '2026-09-01',
        fromTime: '10:00',
        toDate: '2026-09-01',
        toTime: '14:00',
      })
    )
);

rmSync(dir, { recursive: true, force: true });

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
