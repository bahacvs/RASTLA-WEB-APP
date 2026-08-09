/**
 * Kategoriye göre ÖNERİLEN hava eşikleri — sihirbazın başlangıç değerleri.
 *
 * Bunlar bir taahhüt değil, doldurulmuş bir form. Su sporlarında güvenli
 * sınırı belirleyen şey ekipman, eğitmen ve koy; hiçbir tablo bunu bilemez.
 * İşletme değiştirmezse de sorumluluk onda kalır — bu yüzden sihirbaz
 * değerleri açıkça "öneri" diye gösteriyor.
 *
 * Ayrı dosyada ve **hiçbir şey içe aktarmıyor**: sihirbaz bir istemci
 * bileşeni ve `lib/weather/index.mjs`'i içe aktarsaydı sağlayıcılar
 * (`fetch`, `process.env`) tarayıcı paketine girerdi. `lib/permissions.ts`
 * ve `lib/booking-sources.ts` ile aynı gerekçe.
 *
 * @type {Record<string, { wind: number, gust: number, wave: number }>}
 */
export const SUGGESTED_LIMITS = {
  'jet-ski': { wind: 35, gust: 50, wave: 1.0 },
  'elektrikli-sup': { wind: 20, gust: 30, wave: 0.5 },
  sup: { wind: 18, gust: 28, wave: 0.4 },
  kano: { wind: 22, gust: 32, wave: 0.5 },
  tekne: { wind: 40, gust: 55, wave: 1.5 },
  'ruzgar-sorfu': { wind: 45, gust: 60, wave: 1.5 },
};
