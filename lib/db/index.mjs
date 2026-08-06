import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

/** @returns {Promise<Client>} */
export function db() {
  clientPromise ??= usingPostgres ? createPostgresClient() : createSqliteClient();
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
];

// ------------------------------------------------------------------- SQLite

/** @returns {Promise<Client>} */
async function createSqliteClient() {
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

  // Şema kurulumu tek seferlik; havuzdan bir bağlantı alıp uygulanır.
  await pool.query(schemaFor('postgres'));
  for (const { table, column, type } of ADDED_COLUMNS) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
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
