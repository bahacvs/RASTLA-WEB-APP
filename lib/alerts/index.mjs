import { randomUUID } from 'node:crypto';
import { db } from '../db/index.mjs';
import { alertRecipients, sendMail } from '../mail/index.mjs';
import { dedupeKey, evaluateRules } from './rules.mjs';

export { RULES, dedupeKey, evaluateRules } from './rules.mjs';

/**
 * Uyarıların kaydedilmesi ve haber verilmesi.
 *
 * İki iddia var:
 *
 *   1. **Aynı olay bir kez uyarı üretir.** Garanti `alerts.dedupe_key`
 *      üzerindeki `UNIQUE` kısıtı ve `ON CONFLICT DO NOTHING`. Kontrol
 *      veritabanında; "önce bak, sonra yaz" yazılsaydı iki eşzamanlı süpürme
 *      arasından ikisi de "yok" görüp ikisi de yazabilirdi.
 *   2. **E-posta gövdesinde kişisel veri yoktur.** Uyarı nerede bakılacağını
 *      söyler, ne yazdığını değil. IP, ad ve telefon işlem günlüğünde duruyor
 *      ve orada kalmalı — e-posta üçüncü bir sunucudan geçer.
 */

/**
 * Uyarıyı yazar. **Zaten varsa hiçbir şey yapmaz.**
 *
 * Dönen değer, satırın GERÇEKTEN bu çağrıyla oluşup oluşmadığıdır; e-posta
 * yalnızca oluştuysa gider. Bu ayrım olmasaydı tekilleştirme yalnızca tabloyu
 * korur, posta kutusunu korumazdı.
 *
 * @param {import('./rules.mjs').Finding} finding
 * @param {Date} now
 * @returns {Promise<string | null>} yeni uyarının kimliği, ya da null
 */
async function insertAlert(finding, now) {
  const client = await db();
  const id = randomUUID();
  const key = dedupeKey(finding.rule, finding.target, now);

  const result = await client.run(
    `INSERT INTO alerts (id, at, rule, severity, operator_id, dedupe_key, summary, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      id,
      now.toISOString(),
      finding.rule,
      finding.severity,
      finding.operatorId,
      key,
      finding.summary,
      JSON.stringify(finding.details),
    ]
  );

  return result.changes === 1 ? id : null;
}

/**
 * E-posta gövdesi.
 *
 * Kasten sade ve kasten eksik: hangi kuralın tetiklendiğini, kaç kez ve nerede
 * bakılacağını söyler. Kimin, hangi adresten, hangi telefonla — bunların
 * hiçbiri burada yok. E-posta üçüncü bir sağlayıcının sunucularından geçiyor
 * ve orada saklanıyor; kişisel veriyi oraya taşımak, korumaya çalıştığımız
 * şeyi göndermek olurdu.
 *
 * @param {{ summary: string, rule: string, severity: string, details: string }[]} alerts
 * @param {string} baseUrl
 */
function alertEmail(alerts, baseUrl) {
  const lines = alerts.map(
    (a) => `- [${a.severity.toUpperCase()}] ${a.summary}\n  kural: ${a.rule} · ${a.details}`
  );

  return {
    subject: `RASTLA güvenlik uyarısı (${alerts.length})`,
    text: [
      'Otomatik tespit kuralları aşağıdaki durumları bildirdi.',
      '',
      ...lines,
      '',
      'Ayrıntı için işlem günlüğüne bakın:',
      `${baseUrl}/isletme/gunluk`,
      '',
      'Bu ileti kişisel veri içermez. Kim, hangi adresten ve hangi kayıt —',
      'bu soruların cevabı yalnızca işlem günlüğündedir.',
      '',
      'Gerçek bir ihlal söz konusuysa müdahale planındaki adımları izleyin:',
      'legal/veri-ihlali-mudahale-plani.md',
    ].join('\n'),
  };
}

/**
 * Kuralları çalıştırır, yeni uyarıları kaydeder ve haber verir.
 *
 * @param {{ apply?: boolean, now?: Date }} [options]
 * @returns {Promise<{ found: number, created: number, notified: number, mailError?: string }>}
 */
export async function runAlerts({ apply = true, now = new Date() } = {}) {
  const client = await db();
  const findings = await evaluateRules(client, now);

  if (!apply) return { found: findings.length, created: 0, notified: 0 };

  /** @type {string[]} */
  const createdIds = [];
  for (const finding of findings) {
    const id = await insertAlert(finding, now);
    if (id) createdIds.push(id);
  }

  if (createdIds.length === 0) {
    return { found: findings.length, created: 0, notified: 0 };
  }

  const fresh = await client.all(
    `SELECT id, rule, severity, summary, details FROM alerts
      WHERE notified_at IS NULL AND id IN (${createdIds.map(() => '?').join(', ')})`,
    createdIds
  );

  const recipients = alertRecipients();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const message = alertEmail(fresh, baseUrl);

  const sent = await sendMail({ to: recipients, ...message });

  if (!sent.ok) {
    // Uyarılar KAYDEDİLDİ ama haber verilemedi. `notified_at` boş bırakılıyor
    // ki bir sonraki koşum tekrar denesin; kayıtlar ekranda zaten görünüyor.
    return {
      found: findings.length,
      created: createdIds.length,
      notified: 0,
      mailError: sent.error,
    };
  }

  await client.run(
    `UPDATE alerts SET notified_at = ? WHERE id IN (${fresh.map(() => '?').join(', ')})`,
    [now.toISOString(), ...fresh.map((a) => a.id)]
  );

  return { found: findings.length, created: createdIds.length, notified: fresh.length };
}

/**
 * İşletmenin kapatılmamış uyarıları.
 *
 * `operator_id IS NULL` olanlar sistem geneli uyarılardır ve herkese görünür;
 * bir işletmeye özgü olanı yalnızca o işletme görür — günlükteki ayrımın
 * aynısı.
 *
 * @param {string} operatorId
 * @param {number} [limit]
 */
export async function listOpenAlerts(operatorId, limit = 20) {
  return (await db()).all(
    `SELECT * FROM alerts
      WHERE resolved_at IS NULL AND (operator_id = ? OR operator_id IS NULL)
      ORDER BY at DESC
      LIMIT ?`,
    [operatorId, limit]
  );
}

/**
 * Uyarıyı kapatır.
 *
 * Koşul `resolved_at IS NULL`: iki kişi aynı anda kapatsa da kaydı ilk kapatan
 * kişi yazılır. "Kim gördü" sorusunun cevabı tek olmalı.
 *
 * @param {string} id
 * @param {string} operatorId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function resolveAlert(id, operatorId, userId) {
  const result = await (
    await db()
  ).run(
    `UPDATE alerts SET resolved_at = ?, resolved_by = ?
      WHERE id = ? AND resolved_at IS NULL AND (operator_id = ? OR operator_id IS NULL)`,
    [new Date().toISOString(), userId, id, operatorId]
  );
  return result.changes === 1;
}
