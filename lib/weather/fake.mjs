/**
 * Test sağlayıcısı — doğrulama betikleri dış servise çıkmasın diye.
 *
 * `lib/payments/fake.ts` ve `lib/sms` konsol uygulamasıyla aynı rol. Farkı:
 * burada betiğin **ölçümü seçebilmesi** gerekiyor, çünkü sınanan şey tam da
 * "şu rüzgârda ne oluyor" sorusu. Değerler ortam değişkeninden okunuyor;
 * doğrulama betiği çocuk süreci kurarken veriyor.
 *
 *   WEATHER_PROVIDER=fake
 *   WEATHER_FAKE=wind=45,gust=60,wave=1.2      tüm günler aynı
 *   WEATHER_FAKE=bos                            sağlayıcı veri döndürmüyor
 *   WEATHER_FAKE=hata                           sağlayıcıya ulaşılamıyor
 *
 * `bos` ile `hata` ayrı: biri "servis çalıştı, ölçümü yok", diğeri "servise
 * ulaşılamadı". İkisi de `bilinmiyor` ile sonuçlanmalı ve doğrulama bunu iki
 * yoldan da sınıyor.
 *
 * Ölçümü verilmeyen alan `null` kalır — ölçülmemiş demektir, sıfır değil.
 */

/**
 * @param {string} spec
 * @returns {Record<string, number>}
 */
function parse(spec) {
  /** @type {Record<string, number>} */
  const values = {};
  for (const part of spec.split(',')) {
    const [key, raw] = part.split('=');
    const value = Number(raw);
    if (key && Number.isFinite(value)) values[key.trim()] = value;
  }
  return values;
}

/** @returns {import('./index.mjs').WeatherProvider} */
export function fakeWeatherProvider() {
  return {
    name: 'fake',

    /**
     * @param {number} _lat
     * @param {number} _lng
     * @param {number} days
     * @returns {Promise<import('./index.mjs').DailyForecast[]>}
     */
    async forecast(_lat, _lng, days) {
      const spec = process.env.WEATHER_FAKE ?? '';

      if (spec === 'hata') throw new Error('fake: sağlayıcıya ulaşılamadı');
      if (spec === 'bos') return [];

      const values = parse(spec);
      const today = new Date();

      return Array.from({ length: days }, (_, offset) => {
        const day = new Date(today);
        day.setDate(day.getDate() + offset);
        return {
          date: day.toISOString().slice(0, 10),
          windKmh: values.wind ?? null,
          gustKmh: values.gust ?? null,
          waveM: values.wave ?? null,
          precipitationMm: values.yagis ?? null,
        };
      });
    },
  };
}
