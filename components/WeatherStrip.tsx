import type { StoredForecast } from '@/lib/weather-view';
import { VERDICT_LABELS, VERDICT_TONE } from '@/lib/weather-view';

/**
 * Bir günün hava değerlendirmesi.
 *
 * Şerit **yalnızca söyleyecek bir şey varsa** görünüyor: tahmin yoksa ya da
 * gün `uygun` ise hiçbir şey çizilmez. Her sabah "hava uygun" yazan bir kutu,
 * bir süre sonra hiç okunmayan bir kutuya dönüşür ve gerçekten uyarı verdiği
 * gün de okunmaz.
 *
 * Hiçbir yerde iptal önerilmiyor, iptal DÜĞMESİ gösteriliyor — ikisi farklı
 * şeyler. Karar işletmenin; şerit yalnızca ölçümü ve işletmenin kendi
 * koyduğu sınırı yan yana koyuyor.
 */
export function WeatherStrip({
  forecast,
  activityTitle,
}: {
  forecast: StoredForecast | null;
  activityTitle?: string;
}) {
  if (!forecast) return null;
  if (forecast.verdict === 'uygun') return null;

  const measurements = [
    forecast.windKmh !== null ? `rüzgâr ${round(forecast.windKmh)} km/s` : null,
    forecast.gustKmh !== null ? `darbe ${round(forecast.gustKmh)} km/s` : null,
    forecast.waveM !== null ? `dalga ${forecast.waveM.toFixed(1)} m` : null,
  ].filter(Boolean);

  return (
    <div className={`rounded-lg border p-3 ${VERDICT_TONE[forecast.verdict]}`}>
      <p className="text-label-bold">
        {VERDICT_LABELS[forecast.verdict]}
        {activityTitle ? ` · ${activityTitle}` : ''}
      </p>

      {forecast.verdict === 'bilinmiyor' ? (
        <p className="text-body-md opacity-90">
          Tahmin alınamadı. Hava kontrolü bu gün için bir şey söylemiyor — koşulları
          kendiniz değerlendirin.
        </p>
      ) : (
        <p className="text-body-md opacity-90">
          {forecast.reason ?? measurements.join(' · ')}
          {forecast.reason && measurements.length > 0 ? ` (ölçüm: ${measurements.join(' · ')})` : ''}
        </p>
      )}

      <p className="mt-1 text-label-sm opacity-75">
        Tahmindir; hiçbir rezervasyon otomatik iptal edilmedi.
      </p>
    </div>
  );
}

function round(value: number): string {
  return String(Math.round(value));
}
