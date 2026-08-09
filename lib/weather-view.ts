/**
 * Hava değerlendirmesinin arayüz tarafı — saf veri, veritabanı yok.
 *
 * `lib/permissions.ts`, `lib/booking-sources.ts` ve `lib/verification-status.ts`
 * ile aynı gerekçe: bu etiketleri istemci bileşenleri de kullanıyor ve
 * `lib/db/weather.mjs`'ten içe aktarmak veritabanı katmanını (`node:crypto`
 * dahil) tarayıcı paketine çekerdi.
 */

export type WeatherVerdict = 'uygun' | 'riskli' | 'elverissiz' | 'bilinmiyor';

export type StoredForecast = {
  activityId: string;
  date: string;
  windKmh: number | null;
  gustKmh: number | null;
  waveM: number | null;
  precipitationMm: number | null;
  verdict: WeatherVerdict;
  reason: string | null;
  fetchedAt: string;
};

export const VERDICT_LABELS: Record<WeatherVerdict, string> = {
  uygun: 'Hava uygun',
  riskli: 'Hava sınıra yakın',
  elverissiz: 'Hava elverişsiz',
  bilinmiyor: 'Hava bilinmiyor',
};

/**
 * `bilinmiyor` uyarı rengi DEĞİL, nötr.
 *
 * "Ölçemedik" ile "ölçtük, kötü" aynı şey değil; ikisini aynı kırmızıyla
 * göstermek, veri gelmeyen bir günü kötü hava sanmaya yol açardı.
 */
export const VERDICT_TONE: Record<WeatherVerdict, string> = {
  uygun: 'border-outline-variant bg-surface-container-lowest text-on-surface',
  riskli: 'border-tertiary-container bg-tertiary-container text-on-tertiary-container',
  elverissiz: 'border-error-container bg-error-container text-on-error-container',
  bilinmiyor: 'border-outline-variant bg-surface-container-lowest text-on-surface-variant',
};
