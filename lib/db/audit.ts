import { randomUUID } from 'node:crypto';
import { db, toCount } from './index.mjs';

/**
 * İşlem günlüğü.
 *
 * Üç soruya cevap vermek için var:
 *   1. İhlal hâlinde kimin neye eriştiği (müdahale planı, Adım 3).
 *   2. Uyuşmazlıkta bileti kimin onayladığı, kaydı kimin değiştirdiği.
 *   3. Saldırı belirtisi: aynı kaynaktan yoğun başarısız deneme.
 *
 * İki kural:
 *   - **Günlük yazımı asıl işlemi engellemez.** Günlüğe yazarken bir hata
 *     olursa rezervasyon iptal edilmez; hata konsola düşer. Denetim kaydı
 *     önemlidir ama hizmeti durdurmaya değmez.
 *   - **Kişisel veri günlüğe kopyalanmaz.** Ad, telefon gibi alanlar meta'ya
 *     yazılmaz; günlük hangi kaydı işaret ettiğini zaten biliyor. Kopyalamak
 *     aynı veriyi ikinci bir yerde çoğaltmak, yani ihlalde kapsamı büyütmek
 *     olurdu.
 */

export type ActorType = 'operator' | 'customer' | 'system' | 'anonymous';
export type Outcome = 'success' | 'failure' | 'denied';

/**
 * Kaydedilen eylemler.
 *
 * Sabit bir liste: serbest metin olsaydı yazım farklılıkları yüzünden
 * "bir ihlalde tüm onayları bul" sorgusu sessizce eksik sonuç verirdi.
 */
export const AUDIT_ACTIONS = [
  // Telefon doğrulama. KODUN KENDİSİ hiçbir zaman yazılmaz.
  'otp.sent',
  'otp.verified',
  'otp.failed',

  // Kimlik
  'operator.login',
  'operator.login_failed',
  'operator.logout',
  'operator.password_changed',

  // Ekip yönetimi
  'operator_user.created',
  'operator_user.password_reset',
  'operator_user.phone_set',
  'operator_user.suspended',
  'operator_user.reactivated',

  // Bilet — geri alınamaz işlemler
  'booking.created',
  'booking.redeemed',
  'booking.redeem_failed',
  'booking.cancelled',
  'booking.day_cancelled',
  'booking.expired',

  // Ödeme. KART VERİSİ hiçbir zaman yazılmaz; yalnızca tutar ve sağlayıcı
  // referansı. `payment.denied` en önemlisi: sağlayıcının söylediği tutar
  // bizim kaydımızla uyuşmadığında düşer ve bu bir saldırı belirtisidir.
  'payment.started',
  'payment.succeeded',
  'payment.failed',
  'payment.denied',
  'payment.refunded',
  'payment.refund_failed',
  'operator.submerchant_created',

  // Katalog
  'activity.created',
  'activity.updated',
  'activity.published',
  'activity.unpublished',
  'schedule.rule_created',
  'schedule.rule_toggled',
  'schedule.slot_toggled',
  'activity.image_uploaded',
  'activity.image_deleted',

  // Kişisel veri hakları
  'account.exported',
  'account.deleted',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntry = {
  action: AuditAction;
  actorType: ActorType;
  actorId?: string | null;
  operatorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  outcome?: Outcome;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown> | null;
};

export type AuditRecord = {
  id: string;
  at: string;
  action: string;
  actorType: ActorType;
  actorId: string | null;
  operatorId: string | null;
  targetType: string | null;
  targetId: string | null;
  outcome: Outcome;
  ip: string | null;
  userAgent: string | null;
  meta: Record<string, unknown> | null;
};

type Row = {
  id: string;
  at: string;
  actor_type: ActorType;
  actor_id: string | null;
  operator_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  outcome: Outcome;
  ip: string | null;
  user_agent: string | null;
  meta: string | null;
};

function toRecord(row: Row): AuditRecord {
  let meta: Record<string, unknown> | null = null;
  if (row.meta) {
    try {
      meta = JSON.parse(row.meta);
    } catch {
      // Bozuk JSON kaydın tamamını kullanılmaz yapmasın.
      meta = { _bozuk: row.meta };
    }
  }

  return {
    id: row.id,
    at: row.at,
    action: row.action,
    actorType: row.actor_type,
    actorId: row.actor_id,
    operatorId: row.operator_id,
    targetType: row.target_type,
    targetId: row.target_id,
    outcome: row.outcome,
    ip: row.ip,
    userAgent: row.user_agent,
    meta,
  };
}

/** Tarayıcı kimliğini kısaltır: tam dizgi hem uzun hem parmak izi taşır. */
function shortenUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  return userAgent.slice(0, 180);
}

export async function record(entry: AuditEntry): Promise<void> {
  try {
    const client = await db();
    await client.run(
      `INSERT INTO audit_log
         (id, at, actor_type, actor_id, operator_id, action,
          target_type, target_id, outcome, ip, user_agent, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        new Date().toISOString(),
        entry.actorType,
        entry.actorId ?? null,
        entry.operatorId ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.outcome ?? 'success',
        entry.ip ?? null,
        shortenUserAgent(entry.userAgent),
        entry.meta ? JSON.stringify(entry.meta) : null,
      ]
    );
  } catch (error) {
    // Günlük yazılamadıysa asıl işlem geri alınmaz — bkz. dosya başı.
    console.error('[audit] kayıt yazılamadı:', entry.action, error);
  }
}

export type AuditQuery = {
  operatorId?: string;
  actorId?: string;
  action?: string;
  outcome?: Outcome;
  /** ISO tarih; bu andan sonrası. */
  since?: string;
  limit?: number;
  offset?: number;
};

export async function listAudit(query: AuditQuery = {}): Promise<AuditRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.operatorId) {
    where.push('operator_id = ?');
    params.push(query.operatorId);
  }
  if (query.actorId) {
    where.push('actor_id = ?');
    params.push(query.actorId);
  }
  if (query.action) {
    where.push('action = ?');
    params.push(query.action);
  }
  if (query.outcome) {
    where.push('outcome = ?');
    params.push(query.outcome);
  }
  if (query.since) {
    where.push('at >= ?');
    params.push(query.since);
  }

  const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
  const offset = Math.max(query.offset ?? 0, 0);

  const rows = await (
    await db()
  ).all<Row>(
    `SELECT * FROM audit_log
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return rows.map(toRecord);
}

export async function countAudit(
  query: Pick<AuditQuery, 'operatorId' | 'action' | 'since'> = {}
): Promise<number> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.operatorId) {
    where.push('operator_id = ?');
    params.push(query.operatorId);
  }
  if (query.action) {
    where.push('action = ?');
    params.push(query.action);
  }
  if (query.since) {
    where.push('at >= ?');
    params.push(query.since);
  }

  const row = await (
    await db()
  ).get<{ n: number | string }>(
    `SELECT COUNT(*) AS n FROM audit_log
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}`,
    params
  );

  return toCount(row?.n);
}

/**
 * Son N saatteki başarısız giriş denemesi sayısı.
 *
 * Zaman hesabı bilinçli olarak burada: sayfa bileşeni içinde `Date.now()`
 * çağırmak render'ı saf olmaktan çıkarır.
 */
export function countRecentLoginFailures(operatorId: string, hours = 24): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return countAudit({ operatorId, action: 'operator.login_failed', since });
}

/*
 * Saklama süresi dolan kayıtların imhası bilinçli olarak burada değil,
 * `lib/jobs/index.mjs` içinde: hem zamanlayıcı hem komut satırı aynı kodu
 * çağırabilsin diye. Süreler legal/veri-saklama-imha-politikasi.md ile aynı.
 */
