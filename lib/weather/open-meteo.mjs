/**
 * Open-Meteo hava tahmini sağlayıcısı.
 *
 * Anahtar istemiyor; bu yüzden varsayılan sağlayıcı olabiliyor ve kurulumda
 * hiçbir şey yapılması gerekmiyor. Karşılığında ticari bir SLA da yok — bu
 * dosyanın arkasındaki arayüz tam da bunun için var: ücretli bir servise
 * geçmek tek dosya değiştirmek demek.
 *
 * İki ayrı uç nokta kullanılıyor:
 *   forecast     — rüzgâr, darbe, yağış (her koordinat için var)
 *   marine       — dalga yüksekliği (yalnızca denize yakın koordinatlarda)
 *
 * Marine ucu iç bölgelerde hata veya boş dizi döndürür. Bu bir arıza değil,
 * beklenen durum: dalga ölçümü yoksa `waveM` **null** kalır ve `judge` o
 * kıyaslamayı atlar. Hata sayılsaydı, göl kenarındaki bir SUP dersi ölçüm
 * yapılamadığı için sürekli `bilinmiyor` görünürdü.
 *
 * Rüzgâr çağrısı başarısızsa dizi **boş** döner — çağıran taraf o günleri
 * `bilinmiyor` yazar. Eksik veriden karar üretmiyoruz.
 *
 * Düz ESM: `lib/weather/index.mjs` ile aynı gerekçe (zamanlanmış iş).
 */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

/** Ağ çağrısı başına üst sınır; iş bir sağlayıcı yüzünden asılı kalmasın. */
const TIMEOUT_MS = 15000;

/**
 * @param {string} url
 * @param {Record<string, string>} params
 * @returns {Promise<any|null>} `null` = ulaşılamadı ya da servis hata verdi.
 */
async function get(url, params) {
  const query = new URLSearchParams(params).toString();
  try {
    const response = await fetch(`${url}?${query}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Diziden güvenli sayı okur.
 *
 * Open-Meteo eksik ölçümü `null` olarak döndürüyor; dizinin uzunluğu yine de
 * gün sayısına eşit oluyor. `Number(null)` sıfırdır — o yüzden açık kontrol
 * ediliyor, yoksa "ölçüm yok" sessizce "rüzgâr 0 km/s"e dönüşürdü.
 *
 * @param {unknown} list
 * @param {number} index
 * @returns {number|null}
 */
function at(list, index) {
  if (!Array.isArray(list)) return null;
  const value = list[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Koordinatı sağlayıcının beklediği hassasiyete indirir.
 *
 * Dört ondalık ~11 m; tahmin ızgarası kilometrelerce. Fazlası hem gereksiz
 * hem de aynı sahildeki aktiviteleri farklı çağrılara böler.
 *
 * @param {number} value
 * @returns {string}
 */
function coord(value) {
  return value.toFixed(4);
}

/** @returns {import('./index.mjs').WeatherProvider} */
export function openMeteoProvider() {
  return {
    name: 'open-meteo',

    /**
     * @param {number} lat
     * @param {number} lng
     * @param {number} days
     * @returns {Promise<import('./index.mjs').DailyForecast[]>}
     */
    async forecast(lat, lng, days) {
      const shared = {
        latitude: coord(lat),
        longitude: coord(lng),
        timezone: 'Europe/Istanbul',
        forecast_days: String(Math.max(1, Math.min(16, days))),
      };

      // Dalga çağrısı paralel; başarısızlığı rüzgâr sonucunu etkilemiyor.
      const [main, marine] = await Promise.all([
        get(FORECAST_URL, {
          ...shared,
          daily: 'wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum',
        }),
        get(MARINE_URL, { ...shared, daily: 'wave_height_max' }),
      ]);

      const dates = main?.daily?.time;
      if (!Array.isArray(dates)) return [];

      // Dalga tarihleri ayrı bir çağrıdan geliyor; indeksle değil tarihle
      // eşleştiriliyor ki iki uç nokta farklı gün sayısı döndürdüğünde
      // ölçümler kaymasın.
      /** @type {Map<string, number|null>} */
      const waves = new Map();
      const marineDates = marine?.daily?.time;
      if (Array.isArray(marineDates)) {
        marineDates.forEach((date, index) => {
          waves.set(String(date), at(marine?.daily?.wave_height_max, index));
        });
      }

      return dates.map((date, index) => ({
        date: String(date),
        windKmh: at(main?.daily?.wind_speed_10m_max, index),
        gustKmh: at(main?.daily?.wind_gusts_10m_max, index),
        waveM: waves.get(String(date)) ?? null,
        precipitationMm: at(main?.daily?.precipitation_sum, index),
      }));
    },
  };
}
