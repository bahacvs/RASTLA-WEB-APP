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
 * `booked` negatife düşmez. Aynı koruma ekipman sayacında da var.
 *
 * İKİ SAYAÇ BİRLİKTE İADE EDİLİR, tek ifadede. Ayrı ifadeler olsaydı biri
 * çalışıp diğeri çalışmayabilir ve slot yarı serbest kalırdı: kişi yeri açık
 * ama araç hâlâ tutulu — kimsenin fark etmeyeceği, yeri boşuna kilitleyen bir
 * durum.
 *
 * @param {string} slotId
 * @param {number} units      kişi/rezervasyon sayacından iade
 * @param {number} [equipment] araç sayacından iade; havuz yoksa 0
 * @returns {Promise<void>}
 */
export async function releaseCapacity(slotId, units, equipment = 0) {
  await (
    await db()
  ).run(
    `UPDATE slots
        SET booked = booked - ?, units_booked = units_booked - ?
      WHERE id = ? AND booked >= ? AND units_booked >= ?`,
    [units, equipment, slotId, units, equipment]
  );
}
