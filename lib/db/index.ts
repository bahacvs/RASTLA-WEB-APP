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

  instance = connection;
  return instance;
}
