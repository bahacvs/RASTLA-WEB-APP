/**
 * Saklama süresi dolan kayıtları imha eder.
 *
 * Politikayı yazmak uyum sağlamaz; çalıştırılması gerekir. Bu betik
 * legal/veri-saklama-imha-politikasi.md içindeki süreleri uygular ve
 * periyodik olarak (aylık) çalıştırılmak üzere tasarlanmıştır.
 *
 * Kullanım:
 *   node scripts/retention.mjs            # ne silineceğini gösterir, SİLMEZ
 *   node scripts/retention.mjs --uygula   # gerçekten siler
 *
 * Süreler ortam değişkeniyle değiştirilebilir; varsayılanlar politikadaki
 * değerlerdir.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'rastla.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.exec(readFileSync(join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8'));

const apply = process.argv.includes('--uygula');

// İşlem günlüğü: 12 ay. IP ve tarayıcı bilgisi kişisel veridir; güvenlik
// amacıyla tutulur ama süresiz tutmak ayrı bir ihlal olurdu.
const AUDIT_DAYS = Number(process.env.AUDIT_RETENTION_DAYS ?? 365);

const cutoff = new Date(Date.now() - AUDIT_DAYS * 24 * 60 * 60 * 1000).toISOString();

const expired = db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE at < ?').get(cutoff).n;
const total = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;

console.log(`İşlem günlüğü — saklama süresi ${AUDIT_DAYS} gün`);
console.log(`  sınır tarihi : ${cutoff.slice(0, 10)}`);
console.log(`  toplam kayıt : ${total}`);
console.log(`  süresi dolan : ${expired}`);

if (!apply) {
  console.log('\nHiçbir şey silinmedi. Gerçekten silmek için: --uygula');
} else {
  const deleted = db.prepare('DELETE FROM audit_log WHERE at < ?').run(cutoff).changes;
  console.log(`\n${deleted} kayıt silindi.`);

  // SQLite silinen alanı dosyaya iade etmez; imhanın diskte de gerçekleşmesi
  // için boşluk geri alınır.
  db.exec('VACUUM');
  console.log('Veritabanı sıkıştırıldı (VACUUM).');
}

db.close();
