/**
 * Tespit kuralları.
 *
 * **Kurallar kod, veri değil.** Veritabanında yapılandırılabilir olsalardı
 * kimsenin gözden geçirmediği eşikler hâline gelirlerdi; burada durdukları
 * için her değişiklik bir kod incelemesinden geçer ve gerekçesi yanında yazar.
 *
 * Her kural aynı şekli döndürür:
 *
 *   { rule, severity, operatorId, target, summary, details }
 *
 * `target` tekilleştirmenin ikinci parçası: aynı kural farklı hedefler için
 * ayrı uyarı üretmeli (bir işletmeye yapılan saldırı, diğerininkini
 * bastırmamalı) ama aynı hedef için saatte bir kez konuşmalı.
 *
 * **Kişisel veri uyarıya kopyalanmaz.** IP adresi ve ad `details` içine
 * yazılmaz; işlem günlüğü zaten hangi kaydı işaret ettiğini biliyor ve aynı
 * veriyi ikinci bir tabloya (ve oradan e-postaya) taşımak bir ihlalde kapsamı
 * büyütmek olurdu. Uyarı "nerede bakmalısın" der, "ne yazıyordu" demez.
 *
 * @typedef {Object} Finding
 * @property {string} rule
 * @property {'info' | 'warning' | 'critical'} severity
 * @property {string | null} operatorId
 * @property {string} target       Tekilleştirme için; kişisel veri OLMAMALI.
 * @property {string} summary
 * @property {Record<string, unknown>} details
 *
 * @typedef {Object} Rule
 * @property {string} id
 * @property {string} description
 * @property {number} windowMinutes
 * @property {(client: any, since: string) => Promise<Finding[]>} evaluate
 */

/**
 * Bir sayıyı güvenle sayıya çevirir — Postgres COUNT() dizgi döndürür.
 * @param {unknown} value
 */
function num(value) {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

/**
 * Yoğunluk kuralları için ortak gövde.
 *
 * Hepsi aynı şeyi yapıyor: belirli bir eylemi bir pencerede grupla, eşiği
 * aşanları bildir. Beş kez yazmak yerine bir kez yazılıp beş kez
 * yapılandırıldı; eşik değişince tek yerde değişir.
 *
 * @param {{
 *   id: string, description: string, action: string, outcome?: string,
 *   windowMinutes: number, threshold: number,
 *   groupBy: 'operator_id' | 'actor_id',
 *   severity: 'info' | 'warning' | 'critical',
 *   summary: (count: number) => string,
 * }} config
 * @returns {Rule}
 */
function densityRule(config) {
  return {
    id: config.id,
    description: config.description,
    windowMinutes: config.windowMinutes,

    async evaluate(client, since) {
      const conditions = ['action = ?', 'at >= ?'];
      const params = [config.action, since];

      if (config.outcome) {
        conditions.push('outcome = ?');
        params.push(config.outcome);
      }

      const rows = await client.all(
        `SELECT ${config.groupBy} AS target, COUNT(*) AS n
           FROM audit_log
          WHERE ${conditions.join(' AND ')}
          GROUP BY ${config.groupBy}
         HAVING COUNT(*) >= ?`,
        [...params, config.threshold]
      );

      return rows
        .filter((row) => row.target)
        .map((row) => ({
          rule: config.id,
          severity: config.severity,
          // actor_id ile gruplandığında işletme bağlamı ayrıca aranmıyor:
          // hedef zaten kişi ve uyarı sistem geneline düşüyor.
          operatorId: config.groupBy === 'operator_id' ? String(row.target) : null,
          target: String(row.target),
          summary: config.summary(num(row.n)),
          details: {
            sayı: num(row.n),
            eşik: config.threshold,
            pencereDakika: config.windowMinutes,
          },
        }));
    },
  };
}

/**
 * Başarısız giriş yoğunluğu.
 *
 * Bir saatte 20 başarısız giriş, insanın parolasını unutmasıyla açıklanmaz.
 * Eşik bilinçli olarak yüksek: aynı işletmenin sahilde çalışan birkaç
 * personeli gün içinde birkaç kez yanlış yazabilir ve her seferinde e-posta
 * atmak uyarıyı gürültüye çevirirdi.
 */
const failedLogins = densityRule({
  id: 'giris-yogunlugu',
  description: 'Bir saatte 20 başarısız giriş denemesi (işletme başına).',
  action: 'operator.login_failed',
  windowMinutes: 60,
  threshold: 20,
  groupBy: 'operator_id',
  severity: 'critical',
  summary: (n) => `Son bir saatte ${n} başarısız giriş denemesi yapıldı.`,
});

/**
 * Reddedilen bilet onayı yoğunluğu.
 *
 * Bilet kodu 160 bit rastgele; tahmin edilemez. Bir saatte 15 reddedilen
 * deneme, ya birinin kod deniyor olması ya da personelin okuyucuyla ciddi bir
 * sorun yaşaması demektir. İkisi de bakılması gereken durumlar.
 */
const redeemFailures = densityRule({
  id: 'bilet-deneme-yogunlugu',
  description: 'Bir saatte 15 reddedilen bilet onayı (kişi başına).',
  action: 'booking.redeem_failed',
  windowMinutes: 60,
  threshold: 15,
  groupBy: 'actor_id',
  severity: 'warning',
  summary: (n) => `Son bir saatte ${n} bilet onayı reddedildi.`,
});

/**
 * Toplu iptal.
 *
 * On dakikada 20 iptal, ele geçirilmiş bir hesabın yapabileceği en yıkıcı
 * şeydir: işletmenin bütün gününü siler ve müşteriler kapıda kalır. Hava
 * kaynaklı toplu iptal ayrı bir eylem (`booking.day_cancelled`) olarak
 * kaydedildiği için bu kural onu saymaz — meşru bir işlem uyarı üretmemeli.
 */
const massCancel = densityRule({
  id: 'toplu-iptal',
  description: 'On dakikada 20 tekil iptal (işletme başına).',
  action: 'booking.cancelled',
  windowMinutes: 10,
  threshold: 20,
  groupBy: 'operator_id',
  severity: 'critical',
  summary: (n) => `Son on dakikada ${n} rezervasyon iptal edildi.`,
});

/**
 * Sık kişisel veri dışa aktarma.
 *
 * Dışa aktarma meşru bir haktır (KVKK md. 11) ama aynı hesaptan günde beşten
 * fazlası normal kullanım değil; ya bir betik çalışıyordur ya da hesap ele
 * geçirilmiştir.
 */
const frequentExport = densityRule({
  id: 'sik-disa-aktarma',
  description: 'Günde 5’ten fazla kişisel veri dışa aktarma (kişi başına).',
  action: 'account.exported',
  windowMinutes: 24 * 60,
  threshold: 6,
  groupBy: 'actor_id',
  severity: 'warning',
  summary: (n) => `Son 24 saatte ${n} kez kişisel veri dışa aktarıldı.`,
});

/**
 * Kurcalanmış ödeme tutarı.
 *
 * `payment.denied` yalnızca sağlayıcının söylediği tutar bizim kaydımızla
 * uyuşmadığında düşer (bkz. lib/payments/flow.ts). Bu bir kullanıcı hatası
 * olamaz; tek bir tanesi bile bakılmaya değer, bu yüzden eşik 1.
 */
const paymentDenied = densityRule({
  id: 'odeme-uyusmazligi',
  description: 'Tutarı uyuşmayan ödeme geri çağrısı — tek bir tanesi bile uyarı üretir.',
  action: 'payment.denied',
  windowMinutes: 60,
  threshold: 1,
  groupBy: 'operator_id',
  severity: 'critical',
  summary: (n) =>
    `${n} ödeme geri çağrısı tutar uyuşmazlığı nedeniyle reddedildi. Bu bir saldırı belirtisidir.`,
});

/**
 * Yeni bir adresten giriş.
 *
 * Diğerlerinden farklı: yoğunluğa değil, ilk kez görülmeye bakıyor. Bir hesap
 * hep aynı yerden giriyorsa yeni bir adresten gelen giriş ya seyahattir ya da
 * çalınmış parolayla yapılmış bir girişin ilk işaretidir. `info` seviyesi
 * bilinçli — çoğu zaman meşrudur ve `critical` demek uyarıyı ucuzlatırdı.
 *
 * IP adresi uyarıya YAZILMAZ. Kendisi kişisel veridir ve zaten işlem
 * günlüğünde duruyor; ikinci bir yere kopyalamak, üstelik e-postayla
 * dışarı göndermek, ihlalde kapsamı büyütürdü.
 *
 * @type {Rule}
 */
const newLocation = {
  id: 'yeni-adresten-giris',
  description: 'Hesabın daha önce hiç görülmemiş bir adresten giriş yapması.',
  windowMinutes: 60,

  async evaluate(client, since) {
    // `NOT EXISTS` alt sorgusu: aynı kişi, aynı adres, PENCEREDEN ÖNCE
    // görülmüş mü. Görülmemişse adres yeni demektir. Karşılaştırma
    // veritabanında yapılıyor; adresleri uygulamaya çekip orada karşılaştırmak
    // hepsini belleğe almak olurdu.
    const rows = await client.all(
      `SELECT a.actor_id AS actor, a.operator_id AS operator, COUNT(*) AS n
         FROM audit_log a
        WHERE a.action = 'operator.login'
          AND a.at >= ?
          AND a.ip IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM audit_log b
             WHERE b.actor_id = a.actor_id
               AND b.ip = a.ip
               AND b.at < ?
          )
        GROUP BY a.actor_id, a.operator_id`,
      [since, since]
    );

    return rows
      .filter((row) => row.actor)
      .map((row) => ({
        rule: 'yeni-adresten-giris',
        severity: /** @type {const} */ ('info'),
        operatorId: row.operator ? String(row.operator) : null,
        target: String(row.actor),
        summary: 'Bir hesap daha önce hiç kullanılmamış bir adresten giriş yaptı.',
        // Adresin KENDİSİ yok; yalnızca kaç kez olduğu.
        details: { girişSayısı: num(row.n), pencereDakika: 60 },
      }));
  },
};

/** @type {Rule[]} */
export const RULES = [
  failedLogins,
  redeemFailures,
  massCancel,
  frequentExport,
  paymentDenied,
  newLocation,
];

/**
 * Tekilleştirme anahtarı: kural + hedef + ZAMAN KOVASI.
 *
 * Kovanın içinde olması, bekleme süresini bedavaya getiriyor. Aynı kural aynı
 * hedef için aynı saat içinde kaç kez tetiklenirse tetiklensin anahtar aynı
 * kalır ve `UNIQUE` kısıtı ikinci kaydı reddeder. Kovasız bir anahtar uyarıyı
 * sonsuza kadar susturur, saat yerine dakika kullanmak ise 60 kat gürültü
 * üretirdi.
 *
 * @param {string} rule
 * @param {string} target
 * @param {Date} now
 * @returns {string}
 */
export function dedupeKey(rule, target, now) {
  const bucket = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  return `${rule}:${target}:${bucket}`;
}

/**
 * Tüm kuralları çalıştırır.
 *
 * @param {any} client
 * @param {Date} [now]
 * @returns {Promise<Finding[]>}
 */
export async function evaluateRules(client, now = new Date()) {
  /** @type {Finding[]} */
  const findings = [];

  for (const rule of RULES) {
    const since = new Date(now.getTime() - rule.windowMinutes * 60 * 1000).toISOString();
    try {
      findings.push(...(await rule.evaluate(client, since)));
    } catch (error) {
      // Bir kuralın çökmesi diğerlerini durdurmamalı: kalanlar hâlâ gerçek
      // bir saldırıyı yakalayabilir.
      console.error(`[uyari] kural çalışmadı: ${rule.id}`, error);
    }
  }

  return findings;
}
