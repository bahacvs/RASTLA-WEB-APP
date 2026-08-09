import { judge, weatherProvider } from './index.mjs';
import {
  activitiesNeedingForecast,
  bookingLoad,
  getForecast,
  saveForecast,
} from '../db/weather.mjs';
import { db } from '../db/index.mjs';
import { sendMail } from '../mail/index.mjs';

/**
 * Hava tahmini işinin gövdesi.
 *
 * `lib/alerts/index.mjs` ile aynı yerde duruyor: iş tanımı
 * (`lib/jobs/index.mjs`) yalnızca zamanlama ve raporlama yapıyor, karar burada.
 *
 * İki iddia:
 *
 *   1. **Veri yoksa hiçbir şey işaretlenmez.** Sağlayıcıya ulaşılamazsa gün
 *      `bilinmiyor` kalır. Eksik veriden "uygun" çıkarmak, tahminin
 *      kendisinden daha tehlikeli olurdu: sistem sustuğu için değil, iyi
 *      olduğu için sessiz sanılırdı.
 *   2. **Hiçbir şey otomatik iptal edilmez.** İş yalnızca işaretler ve
 *      işletmeye haber verir; iptal düğmesi zaten ekranda ve insanın önünde.
 */

/** Kaç günlük tahmin çekilsin. */
const HORIZON_DAYS = 7;

/**
 * Koordinat yuvarlama hassasiyeti — aynı koya bakan aktiviteler tek çağrıda
 * toplanır. İki ondalık ~1 km; tahmin ızgarası zaten bundan kaba.
 */
const GROUP_PRECISION = 2;

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
function groupKey(lat, lng) {
  return `${lat.toFixed(GROUP_PRECISION)},${lng.toFixed(GROUP_PRECISION)}`;
}

/**
 * İşletmeye giden uyarı e-postası.
 *
 * Gövdede müşteri bilgisi YOK — yalnızca kaç rezervasyon olduğu. Uyarının işi
 * "bak" demek; kim geldiği panelde duruyor ve orada kalmalı (aynı gerekçe
 * `lib/alerts/index.mjs` içinde de yazılı).
 *
 * @param {{ title: string, date: string, reason: string|null, bookings: number, guests: number }} input
 * @returns {{ subject: string, text: string }}
 */
export function warningMail(input) {
  const subject = `RASTLA — ${input.date} için hava uyarısı: ${input.title}`;
  const lines = [
    `${input.date} tarihinde "${input.title}" için hava koşulları tanımladığınız sınırların dışında görünüyor.`,
    '',
    input.reason ? `Ölçüm: ${input.reason}` : 'Ölçüm ayrıntısı panelde.',
    `O gün ${input.bookings} rezervasyon (${input.guests} misafir) var.`,
    '',
    'Bu bir TAHMİNDİR ve hiçbir şey otomatik iptal edilmedi.',
    'Kararı siz veriyorsunuz: işletme panelindeki Bugün ekranından günü iptal',
    'edebilir ya da rezervasyonları başka bir saate taşıyabilirsiniz. İptal',
    'edilen rezervasyonların ücreti müşteriye tam olarak iade edilir.',
  ];
  return { subject, text: lines.join('\n') };
}

/**
 * @param {{ apply?: boolean }} [options]
 * @returns {Promise<{
 *   activities: number, calls: number, written: number, unknown: number,
 *   risky: number, unsuitable: number, notified: number, mailError: string|null,
 * }>}
 */
export async function runWeather({ apply = true } = {}) {
  const provider = weatherProvider();
  const activities = await activitiesNeedingForecast();

  const summary = {
    activities: activities.length,
    calls: 0,
    written: 0,
    unknown: 0,
    risky: 0,
    unsuitable: 0,
    notified: 0,
    /** @type {string|null} */ mailError: null,
  };

  if (activities.length === 0) return summary;

  // Sağlayıcı kapalıysa (WEATHER_PROVIDER=none) hiçbir satır yazılmaz.
  // "Bilinmiyor" satırları basmak, kapalı bir özelliği ekranda varmış gibi
  // gösterirdi.
  if (!provider) return summary;

  // Koordinata göre grupla: aynı sahildeki beş aktivite tek çağrı.
  /** @type {Map<string, typeof activities>} */
  const groups = new Map();
  for (const activity of activities) {
    const key = groupKey(activity.lat, activity.lng);
    const list = groups.get(key);
    if (list) list.push(activity);
    else groups.set(key, [activity]);
  }

  for (const list of groups.values()) {
    const first = list[0];

    /** @type {import('./index.mjs').DailyForecast[]} */
    let days = [];
    try {
      days = await provider.forecast(first.lat, first.lng, HORIZON_DAYS);
      summary.calls += 1;
    } catch {
      days = [];
      summary.calls += 1;
    }

    if (days.length === 0) {
      // Ölçüm gelmedi. Var olan satırlara DOKUNULMUYOR: dünkü geçerli bir
      // tahmini "bilinmiyor" ile ezmek, elimizdeki tek bilgiyi silmek olurdu.
      summary.unknown += list.length;
      continue;
    }

    for (const activity of list) {
      for (const day of days) {
        const measured =
          day.windKmh !== null || day.gustKmh !== null || day.waveM !== null;

        const { verdict, reason } = measured
          ? judge(day, {
              windLimitKmh: activity.windLimitKmh,
              gustLimitKmh: activity.gustLimitKmh,
              waveLimitM: activity.waveLimitM,
            })
          : { verdict: /** @type {const} */ ('bilinmiyor'), reason: null };

        if (verdict === 'riskli') summary.risky += 1;
        if (verdict === 'elverissiz') summary.unsuitable += 1;
        if (verdict === 'bilinmiyor') summary.unknown += 1;

        if (!apply) continue;

        // Bildirim, satır YAZILMADAN ÖNCE karara bağlanıyor: aynı gün için
        // ikinci kez "elverişsiz" yazıldığında yeniden posta gitmesin.
        const previous = verdict === 'elverissiz' ? await getForecast(activity.id, day.date) : null;

        await saveForecast({
          activityId: activity.id,
          date: day.date,
          windKmh: day.windKmh,
          gustKmh: day.gustKmh,
          waveM: day.waveM,
          precipitationMm: day.precipitationMm,
          verdict,
          reason,
        });
        summary.written += 1;

        if (verdict !== 'elverissiz') continue;
        if (previous?.verdict === 'elverissiz') continue;

        const notified = await notifyOperator(activity, day.date, reason);
        if (notified.sent) summary.notified += 1;
        if (notified.error) summary.mailError = notified.error;
      }
    }
  }

  return summary;
}

/**
 * Yalnızca **rezervasyonu olan** günler için posta gider.
 *
 * Kimsenin gelmediği bir günün elverişsiz olması işletmeyi ilgilendirmiyor ve
 * her sabah gelen boş bir uyarı, uyarıların tamamen okunmamasına yol açardı.
 *
 * @param {{ id: string, operatorId: string, title: string }} activity
 * @param {string} date
 * @param {string|null} reason
 * @returns {Promise<{ sent: boolean, error: string|null }>}
 */
async function notifyOperator(activity, date, reason) {
  const load = await bookingLoad(activity.id, date);
  if (load.bookings === 0) return { sent: false, error: null };

  const operator = await (
    await db()
  ).get('SELECT contact_email FROM operators WHERE id = ?', [activity.operatorId]);

  const to = operator?.contact_email;
  if (!to) {
    // Adres yoksa bu bir posta hatası değil, eksik bir işletme kaydı. İş
    // BAŞARISIZ sayılmıyor; uyarı panelde zaten görünüyor.
    return { sent: false, error: null };
  }

  const mail = warningMail({ title: activity.title, date, reason, ...load });
  const result = await sendMail({ to: [to], subject: mail.subject, text: mail.text });

  return result.ok ? { sent: true, error: null } : { sent: false, error: result.error };
}
