import { db } from './index.mjs';
import { releaseCapacity, reserveCapacity } from './capacity.mjs';

/**
 * Rezervasyonu başka bir slota taşır.
 *
 * Hava kötüleştiğinde iptal tek seçenek olmamalı: müşteri parasını değil
 * aktiviteyi istiyor ve taşıma ne iade ne de hak ediş kaydı açar. Ama taşıma,
 * iki slot ve bir rezervasyon üzerinde yapılan **üç ayrı** değişiklik demek ve
 * sıra burada belirleyici.
 *
 * SIRA — ve neden bu sıra:
 *
 *   1. YENİ slotta yer tutulur (`reserveCapacity`, tek koşullu UPDATE).
 *   2. Rezervasyon `WHERE code=? AND status='confirmed' AND slot_id=<eski>`
 *      koşuluyla taşınır.
 *   3. ESKİ slot serbest bırakılır.
 *
 * Herhangi bir adımda süreç ölürse sonuç şu olur: yeni yer tutulamadıysa
 * hiçbir şey değişmemiştir; 2. adım kaybedilirse yalnızca fazladan tutulmuş
 * bir yer kalır. Müşteri hiçbir durumda yersiz kalmaz. Ters sıra (önce eski
 * yeri bırak) daha "temiz" görünürdü ama arada geçen milisaniyede o yeri
 * başkası alabilir ve müşteri iki slotun da dışında kalırdı.
 *
 * 2. adımdaki `slot_id = <eski>` koşulu, iki eşzamanlı taşıma denemesinden
 * yalnızca birinin geçmesini sağlar: ikincisi 0 satır etkiler ve tuttuğu yeri
 * geri bırakır. Kapasitenin her yerdeki güvencesiyle aynı desen. "Önce oku,
 * sonra taşı" yazılsaydı on iki süreç aynı eski slotu görür, hepsi hedefte yer
 * tutar ve rezervasyon tek bir yerdeyken kapasite on iki yerde tutulmuş olurdu.
 *
 * Düz ESM: doğrulama betiği bu işlevi ayrı düğüm süreçleri olarak çağırıyor
 * (eşzamanlılık iddiası ancak öyle sınanabilir) ve TypeScript modülünü
 * doğrudan yükleyemiyor. `capacity.mjs` ve `expiry.mjs` ile aynı gerekçe.
 *
 * KESİT KURALI BURADA UYGULANMIYOR (`booking_cutoff_minutes`). O kural
 * müşterinin son dakika rezervasyon AÇMASINI engellemek için var; işletme
 * başlamak üzere olan bir seansı yarım saat ilerisine taşıyabilmeli. Kuralı
 * burada da işletmek, taşımayı tam ihtiyaç duyulduğu anda kilitlerdi.
 *
 * @typedef {'not_found'|'not_confirmed'|'same_slot'|'slot_not_found'
 *   |'other_activity'|'closed'|'full'|'no_equipment'|'moved'} RescheduleFailure
 *
 * @typedef {{ ok: true, booking: any, from: { date: string, time: string } }
 *   | { ok: false, reason: RescheduleFailure }} RescheduleResult
 *
 * @param {string} code
 * @param {string} newSlotId
 * @returns {Promise<RescheduleResult>}
 */
export async function rescheduleBooking(code, newSlotId) {
  const client = await db();
  const normalized = code.trim().toUpperCase();

  const booking = await client.get('SELECT * FROM bookings WHERE code = ?', [normalized]);
  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.status !== 'confirmed') return { ok: false, reason: 'not_confirmed' };
  if (booking.slot_id === newSlotId) return { ok: false, reason: 'same_slot' };

  const target = await client.get('SELECT * FROM slots WHERE id = ?', [newSlotId]);
  if (!target) return { ok: false, reason: 'slot_not_found' };

  // Taşıma aynı aktivite içinde: başka bir aktiviteye taşımak fiyatı, süreyi
  // ve ekipman hesabını değiştirir — o bir taşıma değil, yeni bir satıştır.
  const activity = await client.get('SELECT id FROM activities WHERE slug = ?', [
    booking.activity_slug,
  ]);
  if (!activity || target.activity_id !== activity.id) {
    return { ok: false, reason: 'other_activity' };
  }

  const units = booking.units;
  const equipment = booking.equipment_units ?? 0;

  // 1 — yeni yer tutulur.
  const held = await reserveCapacity(newSlotId, units, equipment);
  if (!held.ok) {
    return { ok: false, reason: held.reason === 'not_found' ? 'slot_not_found' : held.reason };
  }

  // 2 — rezervasyon taşınır. Eski slot koşulda: yarışta yalnızca biri geçer.
  const moved = await client.run(
    `UPDATE bookings
        SET slot_id = ?, booking_date = ?, booking_time = ?, rescheduled_at = ?
      WHERE code = ? AND status = 'confirmed' AND slot_id ${booking.slot_id ? '= ?' : 'IS NULL'}`,
    booking.slot_id
      ? [
          newSlotId,
          target.slot_date,
          target.slot_time,
          new Date().toISOString(),
          normalized,
          booking.slot_id,
        ]
      : [newSlotId, target.slot_date, target.slot_time, new Date().toISOString(), normalized]
  );

  if (moved.changes !== 1) {
    // Taşıma geçmedi: az önce tuttuğumuz yeri GERİ BIRAKIYORUZ. Bırakılmazsa
    // kimsenin kullanmadığı bir yer sonsuza kadar kilitli kalırdı.
    await releaseCapacity(newSlotId, units, equipment);
    return { ok: false, reason: 'moved' };
  }

  // 3 — eski yer serbest.
  if (booking.slot_id) await releaseCapacity(booking.slot_id, units, equipment);

  const after = await client.get('SELECT * FROM bookings WHERE code = ?', [normalized]);

  return {
    ok: true,
    booking: after,
    from: { date: booking.booking_date, time: booking.booking_time },
  };
}
