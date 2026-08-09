/**
 * Takvim kuralının hangi saatleri ürettiği — saf hesap, sunucu bağımlılığı yok.
 *
 * Ayrı dosyada olmasının somut bir sebebi var: bu hesabı hem slot üreten
 * sunucu kodu (`lib/db/slots.ts`) hem de kuralı yazarken "günde kaç seans
 * çıkacak" diye gösteren istemci formu yapıyor. `lib/db/slots.ts` içinden
 * alınsaydı, o modülü içe aktaran istemci bileşeni veritabanı katmanını
 * tarayıcı paketine sürüklerdi (bkz. lib/booking-sources.ts, lib/permissions.ts).
 *
 * Kopyalamanın bedeli teorik değil, ödendi. İki ayrı kopya vardı ve İKİSİ DE
 * hazırlık payını yok sayıyordu:
 *
 *   - Önizleme `Math.ceil(span / interval)` diyordu; 15 dk aralık + 5 dk
 *     hazırlıkta kullanıcıya "40 slot" deniyor, gerçekte 30 üretiliyordu.
 *   - Daha kötüsü, `syncSlots` beklenen saat kümesini yine prep'siz
 *     hesaplıyordu; üretim prep'li saatlerde slot açtığı için eşitleme onları
 *     "hiçbir kuralın kapsamadığı" sayıp ANINDA KAPATIYORDU. İşletme hazırlık
 *     payını girdiği anda müsaitliğinin çoğunu kaybediyordu.
 *
 * Bu yüzden düzeltme "üç yeri de düzelt" değil, hesabı tek yere indirmek oldu.
 *
 * Düz ESM (.mjs), TypeScript değil — `lib/password.mjs`, `lib/commission.mjs`
 * ve `lib/db/index.mjs` ile aynı gerekçe: doğrulama betikleri düğüm betiği
 * olarak çalışıyor ve TypeScript modülünü doğrudan yükleyemiyor. Tipler JSDoc
 * ile veriliyor, uygulama tarafı yine tam tip denetimi görüyor.
 *
 * @typedef {Object} TimeRule
 * @property {string} startTime
 * @property {string} endTime
 * @property {number} intervalMinutes
 */

/**
 * @param {string} time
 * @returns {number}
 */
export function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * @param {number} minutes
 * @returns {string}
 */
export function toTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Kuralın bir gün için ürettiği saatler.
 *
 * `startTime` dahil, `endTime` hariç: 08:00–18:00 / 15 dk => 40 saat
 * (08:00 … 17:45).
 *
 * Hazırlık süresi aralığa **eklenir**, aralıktan düşülmez: 15 dakikalık tur +
 * 5 dakika hazırlık = 20 dakikada bir kalkış. Düşülseydi seanslar üst üste
 * biner ve ekip iki grubu aynı anda karşılamak zorunda kalırdı.
 *
 * Geçersiz girdide boş dizi döner — form daha yazılırken çağırıyor ve yarım
 * bir saat değeri hata değil, henüz tamamlanmamış bir giriş.
 *
 * @param {TimeRule} rule
 * @param {number} [prepMinutes]
 * @returns {string[]}
 */
export function timesForRule(rule, prepMinutes = 0) {
  if (!/^\d{1,2}:\d{2}$/.test(rule.startTime) || !/^\d{1,2}:\d{2}$/.test(rule.endTime)) return [];

  const step = rule.intervalMinutes + Math.max(0, prepMinutes);
  if (step <= 0) return [];

  const start = toMinutes(rule.startTime);
  const end = toMinutes(rule.endTime);

  /** @type {string[]} */
  const times = [];
  for (let m = start; m < end; m += step) times.push(toTime(m));
  return times;
}
