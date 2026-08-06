import { timingSafeEqual } from 'node:crypto';
import { db } from '../db/index.mjs';

/**
 * Zamanlanmış işler.
 *
 * İki yerden çalıştırılabilir ve **ikisi de tam olarak bu kodu çağırır**:
 *   - HTTP: `/api/gorevler/<ad>` (Vercel Cron)
 *   - Komut satırı: `npm run gorev -- <ad>`
 *
 * İkinci yol bilinçli: bir işin neden çalışmadığını anlamak için onu elle
 * çalıştırabilmek gerekir, ve barındırma sağlayıcısının zamanlayıcısı tek
 * çalıştırma yolu olmamalı.
 *
 * Dosya, `lib/password.mjs` ve `lib/db/index.mjs` gibi düz ESM: düğüm
 * betikleri TypeScript modülünü doğrudan çalıştıramaz ve işin gövdesini iki
 * kez yazmak, birini güncelleyip diğerini unutmanın kapısını açardı.
 *
 * @typedef {Object} JobResult
 * @property {string} job
 * @property {boolean} ok
 * @property {string} summary        İnsan tarafından okunacak özet.
 * @property {Record<string, unknown>} [details]
 *
 * @typedef {Object} Job
 * @property {string} name
 * @property {string} description
 * @property {boolean} destructive   Kalıcı silme yapıyor mu (komut satırında
 *                                   varsayılan olarak kuru çalışır).
 * @property {(options?: { apply?: boolean }) => Promise<JobResult>} run
 */

/**
 * Saklama süresi dolan kayıtların imhası.
 *
 * Veri tutmak kadar zamanında silmek de bir yükümlülük: işlem günlüğündeki IP
 * ve tarayıcı bilgisi kişisel veridir ve süresiz tutulamaz. Süreler
 * legal/veri-saklama-imha-politikasi.md ile aynı olmalı.
 *
 * @type {Job}
 */
const retention = {
  name: 'saklama',
  description: 'Saklama süresi dolan işlem günlüğü kayıtlarını ve hız sınırı sayaçlarını siler.',
  destructive: true,

  async run({ apply = true } = {}) {
    const client = await db();

    const auditDays = Number(process.env.AUDIT_RETENTION_DAYS ?? 365);
    const limitHours = Number(process.env.RATE_LIMIT_RETENTION_HOURS ?? 24);

    const auditCutoff = new Date(Date.now() - auditDays * 24 * 60 * 60 * 1000).toISOString();
    const limitCutoff = new Date(Date.now() - limitHours * 60 * 60 * 1000).toISOString();

    const expiredAudit = count(
      await client.get('SELECT COUNT(*) AS n FROM audit_log WHERE at < ?', [auditCutoff])
    );
    const expiredLimits = count(
      await client.get('SELECT COUNT(*) AS n FROM rate_limits WHERE window_start < ?', [
        limitCutoff,
      ])
    );
    // Doğrulama kodları en fazla 5 dakika yaşar; kaydın kendisi de bir gün
    // sonra işlevsizdir. Telefon numarası içerdikleri için bekletilmez.
    const expiredCodes = count(
      await client.get('SELECT COUNT(*) AS n FROM phone_verifications WHERE created_at < ?', [
        limitCutoff,
      ])
    );

    if (!apply) {
      return {
        job: 'saklama',
        ok: true,
        summary: `${expiredAudit} günlük kaydı, ${expiredLimits} sayaç satırı ve ${expiredCodes} doğrulama kaydı silinecek (kuru çalışma).`,
        details: { expiredAudit, expiredLimits, expiredCodes, auditDays, limitHours, applied: false },
      };
    }

    const auditDeleted = (await client.run('DELETE FROM audit_log WHERE at < ?', [auditCutoff]))
      .changes;
    const limitsDeleted = (
      await client.run('DELETE FROM rate_limits WHERE window_start < ?', [limitCutoff])
    ).changes;
    const codesDeleted = (
      await client.run('DELETE FROM phone_verifications WHERE created_at < ?', [limitCutoff])
    ).changes;

    return {
      job: 'saklama',
      ok: true,
      summary: `${auditDeleted} günlük kaydı, ${limitsDeleted} sayaç satırı, ${codesDeleted} doğrulama kaydı silindi.`,
      details: { auditDeleted, limitsDeleted, codesDeleted, auditDays, limitHours, applied: true },
    };
  },
};

/**
 * COUNT(*) Postgres'te bigint döner ve sürücü bunu dizgi olarak verir.
 * @param {unknown} row
 * @returns {number}
 */
function count(row) {
  const value = row && typeof row === 'object' ? /** @type {any} */ (row).n : row;
  return typeof value === 'number' ? value : Number(value ?? 0);
}

/** @type {Job[]} */
const JOBS = [retention];

/** @returns {Job[]} */
export function listJobs() {
  return JOBS;
}

/**
 * @param {string} name
 * @returns {Job | undefined}
 */
export function getJob(name) {
  return JOBS.find((j) => j.name === name);
}

/**
 * Zamanlayıcı isteğinin gerçekten bizden geldiğini doğrular.
 *
 * Doğrulanmasaydı adresi bilen herkes işleri tetikleyebilirdi. İmha işini
 * defalarca çalıştırmak zararsız olsa da, bir uçtan iş tetikleyebilmek başlı
 * başına bir saldırı yüzeyidir ve ileride eklenecek işler zararsız olmayabilir.
 *
 * Karşılaştırma `timingSafeEqual` ile: `===` kullanılsaydı cevap süresi
 * ölçülerek sır bayt bayt çıkarılabilirdi.
 *
 * @param {string | null} header
 * @returns {boolean}
 */
export function isAuthorized(header) {
  const expected = process.env.CRON_SECRET ?? '';

  // Sır tanımlı değilse iş uçları KAPALIDIR. "Tanımsızsa herkese açık"
  // davranışı, yapılandırmayı unutmayı sessiz bir güvenlik açığına çevirirdi.
  if (!expected || !header) return false;

  // Vercel Cron `Authorization: Bearer <secret>` gönderir; elle çağrıda düz
  // değer de kabul edilir.
  const provided = header.startsWith('Bearer ') ? header.slice(7) : header;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
