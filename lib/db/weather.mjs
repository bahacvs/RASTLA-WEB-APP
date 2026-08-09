import { randomUUID } from 'node:crypto';
import { db } from './index.mjs';

/**
 * Hava tahmini kayıtları.
 *
 * Düz ESM: zamanlanmış `hava` işi düğüm betiği olarak da çalışıyor
 * (`lib/db/capacity.mjs`, `lib/db/expiry.mjs` ile aynı gerekçe). Sunucu
 * tarafındaki ekranlar da buradan okuyor; iki kopya yazmak, birini
 * güncelleyip diğerini unutmanın kapısıydı.
 *
 * Tablo `UNIQUE (activity_id, forecast_date)` taşıyor ve yazma tek bir
 * `ON CONFLICT DO UPDATE` ifadesi: iş günde birkaç kez koşsa da tahmin
 * güncellenir, çoğalmaz. "Önce sil, sonra yaz" yazılsaydı iki koşu arasında
 * ekranda hiç tahmin olmayan bir an oluşurdu.
 */

/**
 * @typedef {Object} StoredForecast
 * @property {string} activityId
 * @property {string} date
 * @property {number|null} windKmh
 * @property {number|null} gustKmh
 * @property {number|null} waveM
 * @property {number|null} precipitationMm
 * @property {'uygun'|'riskli'|'elverissiz'|'bilinmiyor'} verdict
 * @property {string|null} reason
 * @property {string} fetchedAt
 */

/**
 * Tek bir günün tahminini yazar (varsa günceller).
 *
 * @param {{
 *   activityId: string,
 *   date: string,
 *   windKmh?: number|null,
 *   gustKmh?: number|null,
 *   waveM?: number|null,
 *   precipitationMm?: number|null,
 *   verdict: 'uygun'|'riskli'|'elverissiz'|'bilinmiyor',
 *   reason?: string|null,
 * }} input
 * @returns {Promise<void>}
 */
export async function saveForecast(input) {
  await (
    await db()
  ).run(
    `INSERT INTO weather_forecasts
       (id, activity_id, forecast_date, wind_kmh, gust_kmh, wave_m,
        precipitation_mm, verdict, reason, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (activity_id, forecast_date) DO UPDATE SET
       wind_kmh = excluded.wind_kmh,
       gust_kmh = excluded.gust_kmh,
       wave_m = excluded.wave_m,
       precipitation_mm = excluded.precipitation_mm,
       verdict = excluded.verdict,
       reason = excluded.reason,
       fetched_at = excluded.fetched_at`,
    [
      randomUUID(),
      input.activityId,
      input.date,
      input.windKmh ?? null,
      input.gustKmh ?? null,
      input.waveM ?? null,
      input.precipitationMm ?? null,
      input.verdict,
      input.reason ?? null,
      new Date().toISOString(),
    ]
  );
}

/**
 * @param {any} row
 * @returns {StoredForecast}
 */
function toForecast(row) {
  return {
    activityId: row.activity_id,
    date: row.forecast_date,
    windKmh: num(row.wind_kmh),
    gustKmh: num(row.gust_kmh),
    waveM: num(row.wave_m),
    precipitationMm: num(row.precipitation_mm),
    verdict: row.verdict,
    reason: row.reason ?? null,
    fetchedAt: row.fetched_at,
  };
}

/**
 * Postgres REAL sütunlarını sürücü dizgi olarak verebiliyor; NULL ile 0
 * karışmasın diye açık dönüştürme.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function num(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Bir aktivitenin belirli bir günündeki tahmini.
 *
 * @param {string} activityId
 * @param {string} date  YYYY-MM-DD
 * @returns {Promise<StoredForecast|null>}
 */
export async function getForecast(activityId, date) {
  const row = await (
    await db()
  ).get('SELECT * FROM weather_forecasts WHERE activity_id = ? AND forecast_date = ?', [
    activityId,
    date,
  ]);
  return row ? toForecast(row) : null;
}

/**
 * Bir işletmenin bütün aktiviteleri için belirli bir günün tahminleri.
 *
 * Ekranlar bunu tek çağrıda alıyor: aktivite başına sorgu atmak, on ilanlı bir
 * işletmede Bugün ekranını on ek gidiş-dönüşe çıkarırdı.
 *
 * @param {string} operatorId
 * @param {string} date
 * @returns {Promise<Map<string, StoredForecast>>} activityId -> tahmin
 */
export async function forecastsForOperator(operatorId, date) {
  const rows = await (
    await db()
  ).all(
    `SELECT w.* FROM weather_forecasts w
       JOIN activities a ON a.id = w.activity_id
      WHERE a.operator_id = ? AND w.forecast_date = ?`,
    [operatorId, date]
  );

  return new Map(rows.map((row) => [row.activity_id, toForecast(row)]));
}

/**
 * Bir aktivitenin bugünden itibaren tahmin serisi.
 *
 * @param {string} activityId
 * @param {string} fromDate
 * @param {number} days
 * @returns {Promise<StoredForecast[]>}
 */
export async function forecastRange(activityId, fromDate, days) {
  const to = new Date(`${fromDate}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + Math.max(0, days - 1));

  const rows = await (
    await db()
  ).all(
    `SELECT * FROM weather_forecasts
      WHERE activity_id = ? AND forecast_date >= ? AND forecast_date <= ?
      ORDER BY forecast_date`,
    [activityId, fromDate, to.toISOString().slice(0, 10)]
  );

  return rows.map(toForecast);
}

/**
 * Hava eşiği tanımlı ve konumu bilinen YAYINDAKİ aktiviteler.
 *
 * Eşiksiz aktiviteler dışarıda: ölçüm çekmenin bir anlamı olmazdı, hiçbir
 * kıyaslama yapılamayacaktı. Konumsuz aktiviteler de dışarıda — hangi
 * koordinatın havasını soracağımızı bilmiyoruz.
 *
 * @returns {Promise<{
 *   id: string, operatorId: string, title: string, lat: number, lng: number,
 *   windLimitKmh: number|null, gustLimitKmh: number|null, waveLimitM: number|null,
 * }[]>}
 */
export async function activitiesNeedingForecast() {
  const rows = await (
    await db()
  ).all(
    `SELECT id, operator_id, title, lat, lng, wind_limit_kmh, gust_limit_kmh, wave_limit_m
       FROM activities
      WHERE status = 'published'
        AND lat IS NOT NULL AND lng IS NOT NULL
        AND (wind_limit_kmh IS NOT NULL OR gust_limit_kmh IS NOT NULL OR wave_limit_m IS NOT NULL)`
  );

  return rows.map((row) => ({
    id: row.id,
    operatorId: row.operator_id,
    title: row.title,
    lat: Number(row.lat),
    lng: Number(row.lng),
    windLimitKmh: num(row.wind_limit_kmh),
    gustLimitKmh: num(row.gust_limit_kmh),
    waveLimitM: num(row.wave_limit_m),
  }));
}

/**
 * Belirli bir gün ve aktivite için onaylı rezervasyon sayısı.
 *
 * Uyarı e-postası yalnızca **rezervasyonu olan** günler için gidiyor: kimsenin
 * gelmediği bir günün elverişsiz olması işletmeyi ilgilendirmiyor ve her sabah
 * gelen boş bir uyarı, uyarıların tamamen okunmamasına yol açar.
 *
 * @param {string} activityId
 * @param {string} date
 * @returns {Promise<{ bookings: number, guests: number }>}
 */
export async function bookingLoad(activityId, date) {
  const row = await (
    await db()
  ).get(
    `SELECT COUNT(*) AS n, COALESCE(SUM(b.adults + b.children), 0) AS guests
       FROM bookings b
       JOIN slots s ON s.id = b.slot_id
      WHERE s.activity_id = ? AND s.slot_date = ? AND b.status = 'confirmed'`,
    [activityId, date]
  );

  return { bookings: Number(row?.n ?? 0), guests: Number(row?.guests ?? 0) };
}
