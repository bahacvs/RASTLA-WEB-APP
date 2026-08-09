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

/**
 * Slottan kapasite düşer. Aşırı rezervasyona kapalıdır.
 *
 * `releaseCapacity` ile AYNI dosyada, aynı gerekçeyle: tutma ve bırakma tek
 * bir sayacın iki yönü ve ayrı dosyalarda yaşarlarsa biri değişip diğeri
 * unutulabilir. Buraya taşınmasının ikinci sebebi somut: yeniden planlama
 * (`reschedule.mjs`) hem tutuyor hem bırakıyor ve düğüm betiği olarak da
 * çalışabilmesi gerekiyor — TypeScript modülünü yükleyemez.
 *
 * Garanti tek bir koşullu UPDATE'e dayanır — bilet onayındaki desenin aynısı:
 *
 *   UPDATE slots SET booked = booked + :units, units_booked = units_booked + :eq
 *    WHERE id = :id AND status = 'open'
 *      AND booked + :units <= capacity
 *      AND (unit_capacity IS NULL OR units_booked + :eq <= unit_capacity)
 *
 * Bu ifade atomiktir. Son yeri iki kişi aynı anda almaya çalıştığında
 * güncellemeler sıraya girer; ilki kapasiteyi tüketir, ikincisinin WHERE
 * koşulu artık tutmaz ve 0 satır etkiler. Hiçbir yerde "önce say, uygun mu
 * bak, sonra ekle" yapılmaz — o yaklaşım yarış durumuna açıktır.
 *
 * EKİPMAN SINIRI AYNI İFADEYE EKLENDİ, ayrı bir sorgu olarak değil. İki ayrı
 * UPDATE olsaydı arada başka bir işlem araya girebilir ve kişi kapasitesi
 * tutulmuşken ekipman tutulamayabilirdi — geri alınması gereken yarım bir
 * durum. Tek ifadede ya ikisi birden olur ya hiçbiri.
 *
 * Başarısızlıkta SEBEP ayrıştırılıyor: kişi yeri varken ekipman bitmiş
 * olabilir ve kullanıcıya "dolu" demek yanlış olurdu. Ayrıştırma UPDATE'ten
 * SONRA yapılan bir okumaya dayanıyor; karar değil yalnızca mesaj üretiyor,
 * dolayısıyla o okumanın yarışa açık olması bir şeyi bozmuyor.
 *
 * @param {string} slotId
 * @param {number} units      kişi/rezervasyon sayacından düşecek miktar
 * @param {number} [equipment] ekipman sayacından düşecek araç sayısı
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'not_found'|'closed'|'full'|'no_equipment' }>}
 */
export async function reserveCapacity(slotId, units, equipment = 0) {
  const client = await db();

  const result = await client.run(
    `UPDATE slots
        SET booked = booked + ?, units_booked = units_booked + ?
      WHERE id = ? AND status = 'open'
        AND booked + ? <= capacity
        AND (unit_capacity IS NULL OR units_booked + ? <= unit_capacity)`,
    [units, equipment, slotId, units, equipment]
  );

  if (result.changes === 1) return { ok: true };

  const slot = await client.get(
    'SELECT status, unit_capacity, units_booked FROM slots WHERE id = ?',
    [slotId]
  );
  if (!slot) return { ok: false, reason: 'not_found' };
  if (slot.status === 'closed') return { ok: false, reason: 'closed' };
  if (
    slot.unit_capacity !== null &&
    slot.unit_capacity !== undefined &&
    Number(slot.units_booked ?? 0) + equipment > Number(slot.unit_capacity)
  ) {
    return { ok: false, reason: 'no_equipment' };
  }
  return { ok: false, reason: 'full' };
}
