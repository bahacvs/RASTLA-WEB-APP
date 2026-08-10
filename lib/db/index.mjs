import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  DEFAULT_COMMISSION_BP as COMMISSION_BP,
  PREVIOUS_COMMISSION_BP,
} from '../commission.mjs';

/**
 * Veritabanı bağlantısı — SQLite ya da Postgres.
 *
 * Hangisinin kullanılacağını `DATABASE_URL` belirler:
 *   tanımlıysa   -> Postgres (üretim; Vercel'de tek gereken budur)
 *   tanımsızsa   -> SQLite dosyası (yerel geliştirme ve doğrulama betikleri)
 *
 * DİKKAT — SQLite dosya tabanlı olduğu için Vercel'in sunucusuz ortamında
 * KALICI DEĞİLDİR. Üretimde mutlaka `DATABASE_URL` verilmelidir.
 *
 * Arayüz **eşzamansızdır** (`await`). Postgres sürücüleri eşzamanlı çalışamaz;
 * eşzamanlı bir arayüz seçilseydi Postgres'e geçiş hiç mümkün olmazdı. SQLite
 * sürücüsü eşzamanlı çalışsa da aynı sözü verir, böylece çağıran taraf hangi
 * motorun altta olduğunu bilmek zorunda kalmaz.
 */

/**
 * Bu dosya bilinçli olarak düz ESM (.mjs), TypeScript değil.
 *
 * Sebebi: `npm run seed`, `npm run retention` ve `operator-account` betikleri
 * de aynı bağlantıyı kullanmak zorunda ve düğüm betikleri TypeScript modülünü
 * doğrudan çalıştıramaz. İki ayrı sürücü yazmak yerine tek uygulama tutulup
 * türler JSDoc ile verildi — uygulama tarafı yine tam tip denetimi görür.
 *
 * @typedef {unknown[] | Record<string, unknown>} QueryParams
 *
 * @typedef {Object} Client
 * @property {<T>(sql: string, params?: QueryParams) => Promise<T | undefined>} get
 *   Tek satır döner; yoksa undefined.
 * @property {<T>(sql: string, params?: QueryParams) => Promise<T[]>} all
 *   Tüm satırları döner.
 * @property {(sql: string, params?: QueryParams) => Promise<{ changes: number }>} run
 *   Etkilenen satır sayısını döner. Koşullu UPDATE deseninin dayanağı budur.
 * @property {() => Promise<void>} close
 *   Bağlantıyı kapatır. Yalnızca betikler için; uygulama kapatmaz.
 */

export const usingPostgres = Boolean(process.env.DATABASE_URL);

/** @type {Promise<Client> | null} */
let clientPromise = null;

/**
 * Sorgu günlüğü — `RASTLA_QUERY_LOG=1` ile açılır.
 *
 * Var olma sebebi somut bir hata sınıfı: bir döngü içinde `await` edilen
 * sorgu. Yerelde SQLite ile görünmüyor (sorgu 0,1 ms) ama sunucu ile
 * veritabanı arasında ağ varken doğrusal büyüyor — Bugün ekranı dolu bir
 * günde 82 ayrı sorgu atıp sekiz saniyeye çıkmıştı ve bu, kimse saymadığı
 * için aylarca fark edilmedi.
 *
 * Sayılabilir olması, "N+1 yok" iddiasının doğrulanabilir olması demek;
 * `verify-performance.mjs` tam olarak bu satırları sayıyor.
 *
 * ÜRETİMDE KAPALI. Açıksa her sorgu günlüğe düşer ve SQL metni kişisel veri
 * içermese de gereksiz gürültü üretir; parametreler zaten hiç yazılmıyor.
 */
/**
 * Bayrak KÖŞELİ PARANTEZLE ve HER ÇAĞRIDA okunuyor.
 *
 * `process.env.RASTLA_QUERY_LOG` yazımı derleyici tarafından derleme
 * anındaki değerle değiştiriliyor; değişken derlemede tanımlı değilse
 * kod `undefined === '1'` hâline geliyor ve çalışma anında ne yaparsanız
 * yapın açılmıyor. Bu tam olarak yaşandı: sunucu bayrakla başlatıldı,
 * günlüğe tek satır düşmedi. Köşeli erişim bu değiştirmeyi atlıyor.
 *
 * Modül yüklenirken bir kez okumak da yetmezdi: `next start` ile çalışan
 * sunucuda modül, isteklerden önce yükleniyor.
 */
function queryLogEnabled() {
  return process.env['RASTLA_QUERY_LOG'] === '1';
}

/** @param {string} sql */
function logQuery(sql) {
  if (!queryLogEnabled()) return;
  // Yalnızca ifadenin başı: tam metin günlüğü okunmaz hâle getiriyor ve
  // sayım için ilk sözcükler zaten yeterli. Parametreler HİÇ yazılmıyor —
  // içlerinde telefon ve ad var.
  console.log(`[sql] ${sql.replace(/\s+/g, ' ').trim().slice(0, 70)}`);
}

/**
 * İstemciyi sorgu günlüğüyle sarar.
 *
 * Sarmalama tek yerde: her sürücünün kendi içine `logQuery` serpiştirmek,
 * yeni bir sürücü eklendiğinde unutulacak bir adım olurdu. Sarmalama
 * koşulsuz; kararı `logQuery` veriyor, böylece bayrak sunucu ayaktayken
 * de anlamlı kalıyor.
 *
 * @param {Client} client
 * @returns {Client}
 */
function withQueryLog(client) {
  return {
    async get(sql, params) {
      logQuery(sql);
      return client.get(sql, params);
    },
    async all(sql, params) {
      logQuery(sql);
      return client.all(sql, params);
    },
    async run(sql, params) {
      logQuery(sql);
      return client.run(sql, params);
    },
    close: () => client.close(),
  };
}

/** @returns {Promise<Client>} */
export function db() {
  clientPromise ??= (usingPostgres ? createPostgresClient() : createSqliteClient()).then(
    withQueryLog
  );
  return clientPromise;
}

// --------------------------------------------------------------------- şema

/**
 * Şemayı hedef motora çevirir.
 *
 * schema.sql SQLite ağzıyla yazılmıştır ama bilinçli olarak sade tutuldu;
 * Postgres'e çevirmek için gereken tek şey birkaç sözcük:
 *
 *   PRAGMA …    -> Postgres'te yok, atılır
 *   REAL        -> DOUBLE PRECISION
 *
 * TEXT, INTEGER, CHECK, UNIQUE, REFERENCES, ON CONFLICT ve CREATE INDEX
 * IF NOT EXISTS her iki motorda da aynı çalışır.
 */
/**
 * @param {'sqlite' | 'postgres'} engine
 * @returns {string}
 */
function schemaFor(engine) {
  const raw = readFileSync(join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8');
  if (engine === 'sqlite') return raw;

  return raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('PRAGMA'))
    .join('\n')
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION');
}

/**
 * Var olan tablolara sonradan eklenen sütunlar.
 *
 * `CREATE TABLE IF NOT EXISTS` yalnızca yeni veritabanlarını kurar; tablo
 * zaten varsa şemadaki yeni sütun sessizce uygulanmaz.
 *
 * Yeni sütun eklerken İKİ yere yazın: schema.sql (yeni kurulumlar için) ve
 * buraya (mevcut kurulumlar için).
 */
/** @type {Array<{ table: string, column: string, type: string }>} */
const ADDED_COLUMNS = [
  { table: 'users', column: 'deleted_at', type: 'TEXT' },
  { table: 'operator_users', column: 'phone', type: 'TEXT' },

  // Ödeme fazı.
  { table: 'bookings', column: 'confirmed_at', type: 'TEXT' },
  { table: 'bookings', column: 'expired_at', type: 'TEXT' },
  { table: 'bookings', column: 'terms_accepted_at', type: 'TEXT' },
  { table: 'operators', column: 'submerchant_key', type: 'TEXT' },
  { table: 'operators', column: 'legal_type', type: 'TEXT' },
  { table: 'operators', column: 'legal_name', type: 'TEXT' },
  { table: 'operators', column: 'tax_number', type: 'TEXT' },
  { table: 'operators', column: 'tax_office', type: 'TEXT' },
  { table: 'operators', column: 'identity_number', type: 'TEXT' },
  { table: 'operators', column: 'iban', type: 'TEXT' },
  { table: 'operators', column: 'legal_address', type: 'TEXT' },
  { table: 'operators', column: 'contact_email', type: 'TEXT' },
  { table: 'operators', column: 'commission_bp', type: `INTEGER NOT NULL DEFAULT ${COMMISSION_BP}` },

  // Partner fazı — kapasite motoru.
  { table: 'activities', column: 'min_participants', type: 'INTEGER NOT NULL DEFAULT 1' },
  { table: 'activities', column: 'booking_cutoff_minutes', type: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'activities', column: 'prep_minutes', type: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'slots', column: 'unit_capacity', type: 'INTEGER' },
  { table: 'slots', column: 'units_booked', type: 'INTEGER NOT NULL DEFAULT 0' },

  // Partner fazı — rezervasyon kaynağı ve saha operasyonu.
  { table: 'bookings', column: 'source', type: "TEXT NOT NULL DEFAULT 'rastla'" },
  { table: 'bookings', column: 'payment_mode', type: "TEXT NOT NULL DEFAULT 'online'" },
  { table: 'bookings', column: 'attended', type: 'INTEGER' },
  { table: 'bookings', column: 'no_show_at', type: 'TEXT' },
  { table: 'bookings', column: 'created_by', type: 'TEXT' },
  { table: 'bookings', column: 'equipment_units', type: 'INTEGER NOT NULL DEFAULT 0' },

  // Partner fazı — hak ediş.
  { table: 'payments', column: 'item_transaction_ref', type: 'TEXT' },

  // Partner fazı — RASTLA operasyon paneli.
  {
    table: 'operators',
    column: 'verification_status',
    type: "TEXT NOT NULL DEFAULT 'basvuru'",
  },
  { table: 'operators', column: 'verification_note', type: 'TEXT' },
  { table: 'operators', column: 'verified_at', type: 'TEXT' },
  { table: 'operators', column: 'payouts_suspended', type: 'INTEGER NOT NULL DEFAULT 0' },

  // Hava eşikleri. NULL = kontrol yok; varsayılan eşik BİLİNÇLİ olarak yok.
  { table: 'activities', column: 'wind_limit_kmh', type: 'REAL' },
  { table: 'activities', column: 'gust_limit_kmh', type: 'REAL' },
  { table: 'activities', column: 'wave_limit_m', type: 'REAL' },

  // Yeniden planlama: rezervasyonun saati değiştirildiyse ne zaman.
  { table: 'bookings', column: 'rescheduled_at', type: 'TEXT' },

  // Şube. NULL olabilir ve olmalı: şube tanımlamamış işletmelerin mevcut
  // ilanları hiçbir şey yapmadan çalışmaya devam etsin. `ALTER TABLE ADD
  // COLUMN` yabancı anahtar kısıtı taşımıyor — SQLite eklenen sütuna REFERENCES
  // koymayı kabul etmiyor. Yeni kurulumlarda kısıt şemadan geliyor; eskilerde
  // gelmiyor ve bu bilinçli bir kabul: bütünlüğü uygulama tarafında sağlıyoruz
  // (şube kimliği her yerde işletmeye göre doğrulanıyor), göç uğruna tabloyu
  // yeniden yazmak rezervasyon geçmişini riske atardı.
  { table: 'activities', column: 'branch_id', type: 'TEXT' },

  // Acente. Şube ile aynı gerekçe: `ALTER TABLE ADD COLUMN` yabancı anahtar
  // kısıtı taşıyamıyor; bütünlük uygulama tarafında sağlanıyor.
  { table: 'bookings', column: 'agency_id', type: 'TEXT' },

  // Kapora. NULL = kapora yok; mevcut ilanlar hiçbir şey yapmadan eskisi gibi
  // çalışmaya devam ediyor.
  //
  // Eklenen sütunlar CHECK kısıtı TAŞIMIYOR (SQLite `ALTER TABLE ADD COLUMN`
  // ile kısıt kabul etmiyor; şube ve acentede olduğu gibi). Yeni kurulumlarda
  // kısıt şemadan geliyor, eskilerde gelmiyor ve sınır uygulama tarafında
  // uygulanıyor: yüzde sunucu eyleminde, kapora tutarı `depositFor` içinde
  // toplamla sınırlanıyor. Tabloyu göç uğruna yeniden yazmak rezervasyon
  // geçmişini riske atardı.
  { table: 'activities', column: 'deposit_percent', type: 'INTEGER' },
  { table: 'bookings', column: 'deposit_try', type: 'INTEGER NOT NULL DEFAULT 0' },
];

/**
 * `bookings.status` CHECK kısıtının izin verdiği değerler.
 *
 * Sütun eklemek kolay; **kısıt değiştirmek değil.** `CREATE TABLE IF NOT
 * EXISTS` var olan tabloya dokunmadığı için, ödeme fazından önce kurulmuş bir
 * veritabanı `pending_payment` durumunu REDDEDER — ve bu, ilk gerçek ödemede
 * ortaya çıkardı. Bu yüzden kısıt her açılışta denetlenip gerekiyorsa
 * yenileniyor.
 */
const BOOKING_STATUSES = ['pending_payment', 'confirmed', 'redeemed', 'cancelled', 'expired'];

/** `operator_users.role` CHECK kısıtının izin verdiği değerler. */
const OPERATOR_ROLES = ['owner', 'manager', 'staff'];

/**
 * Eski varsayılan komisyonda kalmış işletmeleri yeni varsayılana taşır.
 *
 * Yalnızca **tam olarak eski varsayılana** eşit olanlara dokunur: o değer
 * "kimse elle belirlemedi" demektir. Elle başka bir oran verilmiş bir işletme
 * (indirimli anlaşma, kampanya) buradan etkilenmez — oranı kod değil, o
 * işletmeyle yapılan sözleşme belirler.
 *
 * Yürürlükteki sözleşmesi eski oranı yazan bir kurulumda `RASTLA_KEEP_COMMISSION=1`
 * ile kapatılabilir. Kapatmak veri kaybettirmez; yalnızca göçü atlar.
 */
const COMMISSION_MIGRATION = `UPDATE operators SET commission_bp = ${COMMISSION_BP}
   WHERE commission_bp = ${PREVIOUS_COMMISSION_BP}`;

/**
 * Kısıtı sonradan genişletilen tablolar.
 *
 * `marker`, kısıtın yeni sürümünde geçen ama eskisinde geçmeyen bir metin.
 * Tablonun kurulum SQL'inde bulunuyorsa göç zaten yapılmış demektir.
 *
 * `addedColumns`, kısıt genişlemesiyle aynı turda eklenen ve eski tabloda
 * bulunmayan sütunlar; taşımada NULL olarak gelirler.
 */
const CONSTRAINT_MIGRATIONS = [
  {
    table: 'bookings',
    marker: 'pending_payment',
    addedColumns: ['confirmed_at', 'expired_at'],
    note: 'ödeme durumları eklendi',
  },
  {
    table: 'operator_users',
    marker: "'manager'",
    addedColumns: [],
    note: 'yönetici rolü eklendi',
  },
  {
    table: 'activities',
    marker: 'pending_review',
    addedColumns: [],
    note: 'ilan inceleme durumu eklendi',
  },
];

/** `activities.status` CHECK kısıtının izin verdiği değerler. */
const ACTIVITY_STATUSES = ['draft', 'pending_review', 'published'];

// ------------------------------------------------------------------- SQLite

/** @returns {Promise<Client>} */
async function createSqliteClient() {
  // Vercel'de SQLite'a düşmek sessiz bir arıza üretir, bu yüzden yasak.
  //
  // Sunucusuz dosya sistemi salt okunurdur ve çağrılar arasında paylaşılmaz;
  // SQLite açılsa bile ilk yazmada patlar. Buraya düşüldüyse `DATABASE_URL`
  // yok demektir ve tek doğru davranış, ne olduğunu söyleyip durmaktır —
  // eskiden burada üretilen hata ("EROFS: read-only file system") sebebi
  // göstermiyor, sonucu gösteriyordu.
  //
  // DİKKAT: Vercel ortam değişkenlerini her dağıtıma anlık görüntü olarak
  // bağlar. Değişkeni panelden eklemek MEVCUT dağıtımı düzeltmez; yeniden
  // dağıtmak gerekir. Bu ayrım tam olarak bu hatanın kaynağı olduğu için
  // mesajda açıkça yazıyor.
  if (process.env.VERCEL) {
    throw new Error(
      'DATABASE_URL tanımlı değil. Vercel üzerinde SQLite kullanılamaz: ' +
        'sunucusuz dosya sistemi salt okunurdur ve çağrılar arasında paylaşılmaz. ' +
        'Project Settings → Environment Variables altına DATABASE_URL ekleyin ve ' +
        'YENİDEN DAĞITIN — ortam değişkenleri var olan dağıtımlara geriye dönük uygulanmaz.'
    );
  }

  const { default: Database } = await import('better-sqlite3');

  const path = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'rastla.db');
  mkdirSync(dirname(path), { recursive: true });

  const connection = new Database(path);
  connection.exec(schemaFor('sqlite'));

  for (const { table, column, type } of ADDED_COLUMNS) {
    const columns = connection.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((c) => c.name === column)) {
      connection.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }

  for (const migration of CONSTRAINT_MIGRATIONS) migrateConstraintSqlite(connection, migration);

  if (process.env.RASTLA_KEEP_COMMISSION !== '1') connection.exec(COMMISSION_MIGRATION);

  // better-sqlite3 eşzamanlı çalışır; sözler anında çözülür. Arayüzün
  // eşzamansız olmasının sebebi Postgres, bu sürücü değil.
  return {
    async get(sql, params) {
      return connection.prepare(sql).get(...args(params));
    },
    async all(sql, params) {
      return connection.prepare(sql).all(...args(params));
    },
    async run(sql, params) {
      // RETURNING içeren ifadeler better-sqlite3'te .run() ile çalışmaz;
      // satır döndürdükleri için .all() gerekir.
      if (/\bRETURNING\b/i.test(sql)) {
        const rows = connection.prepare(sql).all(...args(params));
        return { changes: rows.length };
      }
      return { changes: connection.prepare(sql).run(...args(params)).changes };
    },
    async close() {
      connection.close();
    },
  };
}

/**
 * SQLite'ta bir tablonun CHECK kısıtını yeniler.
 *
 * SQLite `ALTER TABLE … DROP CONSTRAINT` desteklemez; kısıt değiştirmenin tek
 * yolu tabloyu yeniden kurmaktır. Adımlar SQLite'ın belgelediği sırayla:
 * yabancı anahtarları kapat, yeni tabloyu kur, veriyi taşı, eskisini düşür,
 * yenisini adlandır, indeksleri geri kur, yabancı anahtarları aç.
 *
 * Önce yalnızca `bookings` için yazılmıştı. İkinci kısıt genişlemesi
 * (`operator_users.role`) gelince kopyalamak yerine tabloya göre
 * parametrelendi — üçüncüsü de gelecek.
 *
 * @param {import('better-sqlite3').Database} connection
 * @param {{ table: string, marker: string, addedColumns: string[], note: string }} migration
 */
function migrateConstraintSqlite(connection, { table, marker, addedColumns, note }) {
  const row = connection
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);

  // Kısıt zaten yeni değerleri içeriyorsa yapılacak bir şey yok.
  if (!row || row.sql.includes(marker)) return;

  const pattern = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`);
  const target = schemaFor('sqlite')
    .split(/;\s*\n/)
    .find((statement) => pattern.test(statement));
  if (!target) return;

  const columns = connection
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);

  // Yeni şemada olup eski tabloda olmayan sütunlar NULL olarak gelir.
  const newColumns = addedColumns.filter((c) => !columns.includes(c));
  const shared = columns.join(', ');

  connection.pragma('foreign_keys = OFF');
  const migrate = connection.transaction(() => {
    connection.exec(
      target.replace(`CREATE TABLE IF NOT EXISTS ${table}`, `CREATE TABLE ${table}_new`)
    );
    connection.exec(
      `INSERT INTO ${table}_new (${shared}${newColumns.length ? `, ${newColumns.join(', ')}` : ''})
       SELECT ${shared}${newColumns.map(() => ', NULL').join('')} FROM ${table}`
    );
    connection.exec(`DROP TABLE ${table}`);
    connection.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
  });
  migrate();
  connection.pragma('foreign_keys = ON');

  // İndeksler tabloyla birlikte düştü; şema yeniden uygulanınca geri gelir.
  connection.exec(schemaFor('sqlite'));
  console.log(`[db] ${table} kısıtı yenilendi (${note}).`);
}

/** better-sqlite3 adlandırılmış parametreleri tek nesne olarak bekler. */
/**
 * @param {QueryParams} [params]
 * @returns {unknown[]}
 */
function args(params) {
  if (params === undefined) return [];
  return Array.isArray(params) ? params : [params];
}

// ----------------------------------------------------------------- Postgres

/**
 * Kurulumu koruyan danışmanlık kilidinin kimliği.
 *
 * Sabit ve keyfi bir sayı; tek şartı bu veritabanında başka bir şeyin aynı
 * sayıyı kullanmaması. Kilit oturum düzeyinde alınıp AÇIKÇA bırakılıyor.
 */
const SETUP_LOCK_ID = 8_140_1972;

/**
 * Postgres şemasını ve göçlerini uygular.
 *
 * Sorgu çalıştırma **dışarıdan veriliyor** çünkü tek yol TCP değil: kısıtlı
 * ağlardan (CI, bazı geliştirme ortamları) 5432 kapalı olabiliyor ve kurulum
 * sağlayıcının HTTPS ucundan yapılmak zorunda kalıyor. Gövde burada tek
 * kopya olarak durduğu sürece hangi yoldan gidilirse gidilsin aynı şema
 * kuruluyor; iki kopya olsaydı biri güncellenip diğeri unutulurdu.
 *
 * KURULUM DANIŞMANLIK KİLİDİYLE KORUNUYOR ve bu, bulunmuş gerçek bir hatanın
 * düzeltmesi. Sunucusuz ortamda birden çok örnek AYNI ANDA soğuk başlıyor ve
 * her biri bu gövdeyi çalıştırıyor. Kısıt göçü kendi kendine karşı güvenli
 * değil: `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` sırası iki süreçte
 * çakışınca ikincisi
 *   constraint "bookings_status_check" for relation "bookings" already exists
 * ile patlıyor ve o isteği düşürüyor. (`CREATE TABLE IF NOT EXISTS` bile
 * eşzamanlı çalışınca pg_type üzerinde benzersizlik ihlali verebiliyor.)
 * 12 eşzamanlı süreçle ölçüldü: kilitten önce çocukların yarısı hata
 * veriyordu.
 *
 * Kilit **danışmanlık** kilidi: tabloları kilitlemiyor, yalnızca kurulumu
 * yapanları sıraya sokuyor. İkinci giren kilidi aldığında iş zaten bitmiş
 * oluyor ve `IF NOT EXISTS`/`DROP … IF EXISTS` ifadeleri sessizce geçiyor.
 *
 * @param {(sql: string) => Promise<unknown>} query
 */
export async function setupPostgres(query) {
  await applySchema(query);
}

/**
 * Eşzamanlı kurulumun ürettiği "zaten var" hatalarını yutar.
 *
 * Danışmanlık kilidi havuzlu yolda yarışı zaten kesiyor; bu ikinci savunma
 * kilidin OLAMADIĞI yol için: sağlayıcının HTTPS ucu her sorguyu ayrı
 * bağlantıda çalıştırıyor ve oturum düzeyli kilit orada tutmuyor.
 *
 * Yalnızca "zaten var" sınıfı yutuluyor — başka bir hata (yazma yetkisi yok,
 * söz dizimi hatası) olduğu gibi yükseliyor. Hepsini yutmak, bozuk bir şemayı
 * sessizce kabul etmek olurdu.
 *
 * @param {(sql: string) => Promise<unknown>} query
 * @param {string} sql
 */
async function tolerantQuery(query, sql) {
  try {
    await query(sql);
  } catch (error) {
    const message = String(error);
    const concurrentDuplicate =
      /already exists|duplicate key value violates unique constraint "pg_/i.test(message);
    if (!concurrentDuplicate) throw error;
  }
}

/** @param {(sql: string) => Promise<unknown>} query */
async function applySchema(query) {
  const run = (sql) => tolerantQuery(query, sql);
  await run(schemaFor('postgres'));

  for (const { table, column, type } of ADDED_COLUMNS) {
    await run(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
  }

  // Durum kısıtı: Postgres'te tabloyu yeniden kurmaya gerek yok, kısıt
  // düşürülüp yeniden eklenebilir. Kısıt adlandırıldığı için bulunabiliyor.
  await run(`ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check`);
  await run(
    `ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
       CHECK (status IN (${BOOKING_STATUSES.map((s) => `'${s}'`).join(', ')}))`
  );

  // Rol kısıtı: 'manager' sonradan eklendi. Postgres'te kısıtın adı
  // öngörülebilir değil (CREATE TABLE içinde adsız tanımlanmışsa
  // operator_users_role_check üretilir), bu yüzden hem otomatik ad hem de
  // bizim verdiğimiz ad düşürülüp yenisi adlandırılarak ekleniyor.
  await run(`ALTER TABLE operator_users DROP CONSTRAINT IF EXISTS operator_users_role_check`);
  await run(
    `ALTER TABLE operator_users ADD CONSTRAINT operator_users_role_check
       CHECK (role IN (${OPERATOR_ROLES.map((r) => `'${r}'`).join(', ')}))`
  );

  // İlan durumu kısıtı: 'pending_review' sonradan eklendi.
  await run(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_status_check`);
  await run(
    `ALTER TABLE activities ADD CONSTRAINT activities_status_check
       CHECK (status IN (${ACTIVITY_STATUSES.map((s) => `'${s}'`).join(', ')}))`
  );

  if (process.env.RASTLA_KEEP_COMMISSION !== '1') await run(COMMISSION_MIGRATION);
}

/** @returns {Promise<Client>} */
async function createPostgresClient() {
  const { Pool } = await import('pg');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Barındırılan Postgres hizmetleri (Neon, Supabase, RDS) TLS ister ama
    // çoğu kendi zincirini sunar; sertifika doğrulaması istenirse
    // DATABASE_SSL=strict ile açılır.
    ssl: sslOption(),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });

  // Şema kurulumu TEK BİR BAĞLANTI üzerinde ve danışmanlık kilidi altında.
  //
  // Kilit oturum düzeyinde; havuzdan her sorgu için ayrı bağlantı alınsaydı
  // kilidi alan ile bırakan farklı bağlantılar olur ve kilit hiç bırakılmazdı.
  // Bu yüzden bağlantı açıkça ödünç alınıyor.
  const setup = await pool.connect();
  try {
    await setup.query(`SELECT pg_advisory_lock(${SETUP_LOCK_ID})`);
    try {
      await setupPostgres((sql) => setup.query(sql));
    } finally {
      // Kilit HER DURUMDA bırakılıyor. Bırakılmazsa kurulum bir kez başarısız
      // olduğunda sonraki bütün süreçler süresiz bekler ve arıza "yavaş"
      // değil "asılı kaldı" biçiminde görünürdü.
      await setup.query(`SELECT pg_advisory_unlock(${SETUP_LOCK_ID})`);
    }
  } finally {
    setup.release();
  }

  return {
    async get(sql, params) {
      const { rows } = await pool.query(...translate(sql, params));
      return rows[0];
    },
    async all(sql, params) {
      const { rows } = await pool.query(...translate(sql, params));
      return rows;
    },
    async run(sql, params) {
      const result = await pool.query(...translate(sql, params));
      // RETURNING varsa rowCount yine etkilenen satırı verir; ikisi de doğru.
      return { changes: result.rowCount ?? 0 };
    },
    async close() {
      await pool.end();
    },
  };
}

function sslOption() {
  const mode = process.env.DATABASE_SSL;
  if (mode === 'off') return undefined;
  if (mode === 'strict') return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

/**
 * Sorguyu Postgres ağzına çevirir.
 *
 * İki fark var:
 *   - Yer tutucular: SQLite `?` ve `@ad`, Postgres `$1`.
 *   - Adlandırılmış parametreler: Postgres'te yok, sırayla diziye açılır.
 *
 * Dizgi sabitlerinin içindeki `?` işaretine dokunulmaz; aksi hâlde metin
 * içindeki bir soru işareti yer tutucu sanılırdı.
 */
/**
 * @param {string} sql
 * @param {QueryParams} [params]
 * @returns {[string, unknown[]]}
 */
export function translate(sql, params) {
  if (params === undefined) return [sql, []];

  if (Array.isArray(params)) {
    let index = 0;
    return [replaceOutsideStrings(sql, /\?/g, () => `$${++index}`), params];
  }

  // Adlandırılmış parametreler: her ad ilk göründüğü sırada numaralanır,
  // tekrar geçtiğinde aynı numarayı alır (SQLite'ın davranışıyla aynı).
  /** @type {string[]} */
  const order = [];
  const converted = replaceOutsideStrings(sql, /[@:]([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name) => {
    let position = order.indexOf(name);
    if (position === -1) position = order.push(name) - 1;
    return `$${position + 1}`;
  });

  return [converted, order.map((name) => params[name])];
}

/** Tek tırnaklı dizgi sabitlerinin dışında kalan bölümlerde değiştirir. */
/**
 * @param {string} sql
 * @param {RegExp} pattern
 * @param {(match: string, group: string) => string} replacer
 * @returns {string}
 */
function replaceOutsideStrings(sql, pattern, replacer) {
  // Dizgi sabitleri korunur, aralarındaki bölümler dönüştürülür.
  const parts = sql.split(/('(?:[^']|'')*')/);
  return parts
    .map((part, index) =>
      index % 2 === 1 ? part : part.replace(pattern, replacer)
    )
    .join('');
}

/**
 * COUNT(*) sonucunu sayıya çevirir.
 *
 * Postgres `bigint` döndürür ve `pg` sürücüsü bunu JavaScript'te güvenle
 * temsil edilemeyebileceği için **dizgi** olarak verir. `row.n === 0`
 * karşılaştırması Postgres'te sessizce hep yanlış çıkardı.
 */
/**
 * @param {unknown} value
 * @returns {number}
 */
export function toCount(value) {
  return typeof value === 'number' ? value : Number(value ?? 0);
}
