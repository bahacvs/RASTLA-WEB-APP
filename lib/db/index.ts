import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Pilot dönemi veritabanı bağlantısı.
 *
 * SQLite bilinçli bir ara adım: şema ve sorgular Postgres'e taşınacak
 * sadelikte yazıldı. DİKKAT — SQLite dosya tabanlı olduğu için Vercel'in
 * sunucusuz ortamında kalıcı DEĞİLDİR. Üretime çıkmadan önce Postgres'e
 * geçilmelidir; değişmesi gereken tek yer bu dosya ve lib/db/bookings.ts.
 */

const DB_PATH = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'rastla.db');

let instance: Database.Database | null = null;

export function db(): Database.Database {
  if (instance) return instance;

  mkdirSync(dirname(DB_PATH), { recursive: true });

  const connection = new Database(DB_PATH);
  const schema = readFileSync(join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8');
  connection.exec(schema);
  migrate(connection);

  instance = connection;
  return instance;
}

/**
 * Var olan tablolara eklenen sütunlar.
 *
 * `CREATE TABLE IF NOT EXISTS` yalnızca yeni veritabanlarını kurar; tablo
 * zaten varsa şemadaki yeni sütun sessizce uygulanmaz. Bu yüzden sonradan
 * eklenen sütunlar burada, veri kaybetmeden ve tekrar çalıştırılabilir
 * biçimde uygulanır.
 *
 * Yeni sütun eklerken İKİ yere yazın: schema.sql (yeni kurulumlar için) ve
 * buraya (mevcut kurulumlar için).
 */
function migrate(connection: Database.Database) {
  ensureColumn(connection, 'users', 'deleted_at', 'TEXT');
}

function ensureColumn(
  connection: Database.Database,
  table: string,
  column: string,
  definition: string
) {
  const columns = connection.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some((c) => c.name === column)) return;

  connection.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
