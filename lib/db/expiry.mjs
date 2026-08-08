import { db } from './index.mjs';
import { releaseCapacity } from './capacity.mjs';

/**
 * Ödeme süresi dolan rezervasyonların düşürülmesi.
 *
 * Buradaki tek iddia şu: **kapasite tam olarak bir kez iade edilir.**
 *
 * Garanti koşullu UPDATE'te. Durum değişikliği gerçekten olduysa (etkilenen
 * satır 1) kapasite geri verilir; olmadıysa hiçbir şey yapılmaz. İki süpürme
 * aynı anda çalışsa, ya da süpürme ile geç gelen bir ödeme geri çağrısı
 * çakışsa bile ikincisi 0 satır etkiler. "Önce listele, sonra hepsini düşür"
 * yazılsaydı iki süreç aynı listeyi görür ve aynı yeri iki kez serbest
 * bırakırdı — sonuç, kapasitenin üzerinde satış.
 *
 * Dosya düz ESM: aynı gövdeyi hem sunucu eylemi (TypeScript) hem zamanlanmış
 * iş (düğüm betiği) çağırıyor. İki kez yazılsaydı biri güncellenip diğeri
 * unutulabilirdi.
 */

/**
 * Tek bir rezervasyonu düşürür ve kapasitesini geri verir.
 *
 * @param {string} bookingId
 * @returns {Promise<boolean>} durum GERÇEKTEN bu çağrıyla değiştiyse true
 */
export async function expireBooking(bookingId) {
  const client = await db();

  const booking = await client.get(
    'SELECT slot_id, units, equipment_units FROM bookings WHERE id = ?',
    [bookingId]
  );
  if (!booking) return false;

  const result = await client.run(
    `UPDATE bookings SET status = 'expired', expired_at = ?
      WHERE id = ? AND status = 'pending_payment'`,
    [new Date().toISOString(), bookingId]
  );

  if (result.changes !== 1) return false;

  // Kişi ve ekipman sayaçları BİRLİKTE iade edilir; yarım iade slotu
  // sessizce kilitli bırakırdı.
  if (booking.slot_id) {
    await releaseCapacity(booking.slot_id, booking.units, booking.equipment_units ?? 0);
  }
  return true;
}

/**
 * Süresi dolmuş bekleyen ödemeleri toplar. `odeme-suresi` işi bunu çağırır.
 *
 * @param {{ minutes?: number, apply?: boolean }} [options]
 * @returns {Promise<{ candidates: number, expired: number, minutes: number }>}
 */
export async function expirePendingPayments({ minutes, apply = true } = {}) {
  const window = Number(minutes ?? process.env.PAYMENT_TIMEOUT_MINUTES ?? 20);
  const cutoff = new Date(Date.now() - window * 60 * 1000).toISOString();

  const pending = await (
    await db()
  ).all(`SELECT id FROM bookings WHERE status = 'pending_payment' AND created_at < ?`, [cutoff]);

  if (!apply) return { candidates: pending.length, expired: 0, minutes: window };

  let expired = 0;
  for (const booking of pending) {
    if (await expireBooking(booking.id)) expired++;
  }

  return { candidates: pending.length, expired, minutes: window };
}
