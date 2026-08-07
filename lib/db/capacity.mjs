import { db } from './index.mjs';

/**
 * Slot kapasitesinin geri verilmesi.
 *
 * Tek satırlık bir ifade ama **tek bir yerde** durması gerekiyor: iptal, ödeme
 * süresi aşımı ve ödeme başlatılamaması, üçü de kapasiteyi geri veriyor. Üç
 * kopya olsaydı biri düzeltilip diğerleri unutulabilirdi ve kapasite hatası,
 * fark edilmesi en zor hata türü — yer boşuna kilitli kalır ya da slot
 * kapasitesinin üzerine çıkılır.
 *
 * Dosya düz ESM (`lib/password.mjs`, `lib/db/index.mjs` gibi): zamanlanmış iş
 * düğüm betiği olarak da çalışıyor ve TypeScript modülünü doğrudan
 * yükleyemiyor. `lib/db/slots.ts` bunu yeniden dışa aktarıyor, dolayısıyla
 * TypeScript tarafındaki çağrı yerleri değişmedi.
 *
 * `booked >= ?` koşulu son savunma: bir hata yüzünden iki kez çağrılsa bile
 * `booked` negatife düşmez.
 *
 * @param {string} slotId
 * @param {number} units
 * @returns {Promise<void>}
 */
export async function releaseCapacity(slotId, units) {
  await (
    await db()
  ).run('UPDATE slots SET booked = booked - ? WHERE id = ? AND booked >= ?', [
    units,
    slotId,
    units,
  ]);
}
