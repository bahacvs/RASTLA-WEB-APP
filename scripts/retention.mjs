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
import { db as connect, toCount, usingPostgres } from '../lib/db/index.mjs';

// Uygulamayla aynı bağlantı katmanı: DATABASE_URL varsa Postgres, yoksa SQLite.
const db = await connect();

const apply = process.argv.includes('--uygula');

// İşlem günlüğü: 12 ay. IP ve tarayıcı bilgisi kişisel veridir; güvenlik
// amacıyla tutulur ama süresiz tutmak ayrı bir ihlal olurdu.
const AUDIT_DAYS = Number(process.env.AUDIT_RETENTION_DAYS ?? 365);

const cutoff = new Date(Date.now() - AUDIT_DAYS * 24 * 60 * 60 * 1000).toISOString();

const expired = toCount((await db.get('SELECT COUNT(*) AS n FROM audit_log WHERE at < ?', [cutoff])).n);
const total = toCount((await db.get('SELECT COUNT(*) AS n FROM audit_log')).n);

console.log(`İşlem günlüğü — saklama süresi ${AUDIT_DAYS} gün`);
console.log(`  sınır tarihi : ${cutoff.slice(0, 10)}`);
console.log(`  toplam kayıt : ${total}`);
console.log(`  süresi dolan : ${expired}`);

// Hız sınırı sayaçları: penceresi kapanmış satırlar. IP adresi içerdikleri
// için de gereksiz yere tutulmamalı.
const RATE_LIMIT_HOURS = Number(process.env.RATE_LIMIT_RETENTION_HOURS ?? 24);
const rateCutoff = new Date(Date.now() - RATE_LIMIT_HOURS * 60 * 60 * 1000).toISOString();

const staleLimits = toCount(
  (await db.get('SELECT COUNT(*) AS n FROM rate_limits WHERE window_start < ?', [rateCutoff])).n
);
const totalLimits = toCount((await db.get('SELECT COUNT(*) AS n FROM rate_limits')).n);

console.log(`\nHız sınırı sayaçları — ${RATE_LIMIT_HOURS} saatten eski`);
console.log(`  toplam satır : ${totalLimits}`);
console.log(`  süresi dolan : ${staleLimits}`);

if (!apply) {
  console.log('\nHiçbir şey silinmedi. Gerçekten silmek için: --uygula');
} else {
  const deleted = (await db.run('DELETE FROM audit_log WHERE at < ?', [cutoff])).changes;
  const limits = (await db.run('DELETE FROM rate_limits WHERE window_start < ?', [rateCutoff]))
    .changes;
  console.log(`\n${deleted} günlük kaydı, ${limits} sayaç satırı silindi.`);

  // Silinen alan dosyaya/tabloya kendiliğinden iade edilmez; imhanın diskte de
  // gerçekleşmesi için boşluk geri alınır. VACUUM her iki motorda da var ama
  // Postgres'te işlem bloğu dışında çalışmalı — burada öyle çalışıyor.
  await db.run(usingPostgres ? 'VACUUM (ANALYZE) audit_log' : 'VACUUM');
  console.log('Veritabanı sıkıştırıldı (VACUUM).');
}

console.log(`\nVeritabanı: ${usingPostgres ? 'Postgres (DATABASE_URL)' : 'SQLite dosyası'}`);
await db.close();
