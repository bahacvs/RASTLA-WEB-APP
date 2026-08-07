/**
 * Zamanlanmış işleri elle çalıştırır.
 *
 * HTTP ucundan (`/api/gorevler/<ad>`) farkı yok — aynı kayıt defterini
 * çağırır (lib/jobs/index.mjs). Barındırma sağlayıcısının zamanlayıcısı tek
 * çalıştırma yolu olmamalı: bir işin neden çalışmadığını anlamak için onu
 * elle çalıştırabilmek gerekir.
 *
 * Kullanım:
 *   npm run gorev                       # işleri listeler
 *   npm run gorev -- saklama            # kalıcı silme yapan işlerde KURU çalışır
 *   npm run gorev -- saklama --uygula   # gerçekten uygular
 */
import { db } from '../lib/db/index.mjs';
import { getJob, listJobs } from '../lib/jobs/index.mjs';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--uygula');

if (!name) {
  console.log('Mevcut görevler:\n');
  for (const job of listJobs()) {
    const flag = job.destructive ? ' (kalıcı silme — --uygula gerekir)' : '';
    console.log(`  ${job.name.padEnd(16)} ${job.description}${flag}`);
  }
  console.log('\nÇalıştırmak için: npm run gorev -- <ad> [--uygula]');
  process.exit(0);
}

const job = getJob(name);
if (!job) {
  console.error(`Bilinmeyen görev: ${name}`);
  console.error(`Mevcut: ${listJobs().map((j) => j.name).join(', ')}`);
  process.exit(1);
}

// Kalıcı silme yapan işler komut satırında varsayılan olarak KURU çalışır:
// "ne silinecek" sorusunu cevaplamadan silmeye başlamamalı. Zamanlayıcı
// HTTP ucundan çağırdığında ise her zaman uygular.
const result = await job.run({ apply: job.destructive ? apply : true });

console.log(result.summary);
if (result.details) console.log(result.details);

if (job.destructive && !apply) {
  console.log('\nHiçbir şey silinmedi. Gerçekten silmek için: --uygula');
}

await (await db()).close();
process.exit(result.ok ? 0 : 1);
