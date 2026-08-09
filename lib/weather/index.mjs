/**
 * Hava tahmini sağlayıcısı.
 *
 * SMS, e-posta, ödeme ve depo ile **aynı desen**: arayüz + tekil önbellek +
 * ortam değişkeniyle seçim + test uygulaması. Tek farkı varsayılanın gerçek
 * bir servis olması: Open-Meteo anahtar istemiyor, dolayısıyla "yapılandırma
 * yapılmadığı için özellik kapalı" durumuna düşmüyor.
 *
 * `WEATHER_PROVIDER=none` ile tamamen kapatılabilir; o zaman iş hiçbir şey
 * çekmez ve bütün günler `bilinmiyor` kalır.
 *
 * Düz ESM: zamanlanmış iş düğüm betiği olarak çalışıyor ve TypeScript modülü
 * yükleyemiyor (`lib/alerts/index.mjs`, `lib/mail/index.mjs` ile aynı gerekçe).
 *
 * @typedef {Object} DailyForecast
 * @property {string} date            YYYY-MM-DD
 * @property {number|null} windKmh    Günün en yüksek sürekli rüzgârı
 * @property {number|null} gustKmh    Günün en yüksek rüzgâr darbesi
 * @property {number|null} waveM      Günün en yüksek dalga yüksekliği
 * @property {number|null} precipitationMm
 *
 * @typedef {Object} WeatherProvider
 * @property {string} name
 * @property {(lat: number, lng: number, days: number) => Promise<DailyForecast[]>} forecast
 */

import { openMeteoProvider } from './open-meteo.mjs';
import { fakeWeatherProvider } from './fake.mjs';

// Öneri tablosu ayrı dosyada: sihirbaz (istemci bileşeni) onu tek başına
// içe aktarıyor ve bu modülü çekseydi sağlayıcılar tarayıcı paketine girerdi.
export { SUGGESTED_LIMITS } from './limits.mjs';

/** @type {WeatherProvider | null} */
let cached = null;

/** @returns {WeatherProvider | null} `null` = hava kontrolü kapalı. */
export function weatherProvider() {
  if (cached) return cached;

  const name = process.env.WEATHER_PROVIDER ?? 'open-meteo';
  if (name === 'none') return null;

  cached = name === 'fake' ? fakeWeatherProvider() : openMeteoProvider();
  return cached;
}

export function resetWeatherProvider() {
  cached = null;
}

/**
 * Ölçümü aktivitenin eşikleriyle karşılaştırır.
 *
 * Karar burada, sağlayıcıda değil: aynı rüzgâr bir tekne turu için sorunsuz,
 * bir SUP dersi için elverişsizdir. Sağlayıcı yalnızca sayıyı getirir.
 *
 * Üç seviye:
 *   uygun      — eşiklerin altında (ya da hiç eşik tanımlanmamış)
 *   riskli     — eşiğin %80'ini aşmış; işletme baksın diye işaretlenir
 *   elverissiz — eşiği aşmış
 *
 * `bilinmiyor` burada ÜRETİLMEZ; ölçüm yoksa çağıran taraf onu yazar. Ayrım
 * önemli: "ölçtük, sorun yok" ile "ölçemedik" aynı şey değil ve ikisini
 * karıştırmak, veri gelmediği için sessiz kalan bir sistemi "her şey yolunda"
 * diyen bir sisteme dönüştürürdü.
 *
 * @param {DailyForecast} forecast
 * @param {{ windLimitKmh: number|null, gustLimitKmh: number|null, waveLimitM: number|null }} limits
 * @returns {{ verdict: 'uygun'|'riskli'|'elverissiz', reason: string|null }}
 */
export function judge(forecast, limits) {
  /** @type {{ label: string, value: number|null, limit: number|null, unit: string }[]} */
  const pairs = [
    { label: 'Rüzgâr', value: forecast.windKmh, limit: limits.windLimitKmh, unit: 'km/s' },
    { label: 'Rüzgâr darbesi', value: forecast.gustKmh, limit: limits.gustLimitKmh, unit: 'km/s' },
    { label: 'Dalga', value: forecast.waveM, limit: limits.waveLimitM, unit: 'm' },
  ];

  /** @type {string[]} */
  const exceeded = [];
  /** @type {string[]} */
  const near = [];

  for (const { label, value, limit, unit } of pairs) {
    if (value === null || limit === null) continue;
    if (value >= limit) exceeded.push(`${label} ${value} ${unit} (sınır ${limit})`);
    else if (value >= limit * 0.8) near.push(`${label} ${value} ${unit} (sınır ${limit})`);
  }

  if (exceeded.length > 0) return { verdict: 'elverissiz', reason: exceeded.join(', ') };
  if (near.length > 0) return { verdict: 'riskli', reason: near.join(', ') };
  return { verdict: 'uygun', reason: null };
}
