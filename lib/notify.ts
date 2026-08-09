import { getUser } from '@/lib/db/users';
import { sendSms } from '@/lib/sms';
import { bookingCancelledMessage, bookingRescheduledMessage } from '@/lib/sms/messages';
import type { Booking } from '@/lib/db/bookings';

/**
 * Müşteriye giden işlem bildirimleri.
 *
 * Buraya kadar sistemde müşteriye giden tek çıkış doğrulama koduydu; iptal
 * ekranı kelimesi kelimesine *"Misafirleri bilgilendirmeyi unutmayın"* diyordu
 * ve bilgilendirme işletmenin eline bırakılmıştı. Hava operasyonu bunsuz yarım
 * kalır: bir günü iptal edip müşteriye haber vermemek, iptal etmemekten daha
 * kötü sonuç doğurur — müşteri yine iskeleye gelir.
 *
 * **Bildirim gönderimi ASLA işlemi başarısız kılmaz.** İptal veritabanında
 * gerçekleşmiştir; SMS sağlayıcısı erişilemediği için iptali geri almak,
 * kapasiteyi ve iadeyi tutarsız bırakırdı. Hata döndürülür, çağıran taraf
 * kullanıcıya "haber verilemedi" diyebilir.
 *
 * NETGSM tanımlanana kadar mesajlar sunucu günlüğüne düşer (`lib/sms/index.ts`
 * console sağlayıcısı). Bu "müşteriye haber verildi" demek değildir ve öyle
 * gösterilmemeli.
 */

export type NotifyResult = { sent: boolean; error: string | null };

/**
 * Rezervasyonun sahibine mesaj gönderir.
 *
 * Silinmiş hesaplara gönderilmez: `deleteUser` telefonu geri döndürülemez bir
 * yer tutucuyla değiştiriyor ve o yer tutucu bir numara değil.
 */
async function toCustomer(booking: Booking, message: string): Promise<NotifyResult> {
  const user = await getUser(booking.userId);
  if (!user || user.deletedAt) return { sent: false, error: null };

  const result = await sendSms(user.phone, message);
  return result.ok ? { sent: true, error: null } : { sent: false, error: result.error };
}

export async function notifyCancellation(
  booking: Booking,
  weather: boolean
): Promise<NotifyResult> {
  return toCustomer(
    booking,
    bookingCancelledMessage({
      code: booking.code,
      date: booking.bookingDate,
      time: booking.bookingTime,
      weather,
    })
  );
}

export async function notifyReschedule(
  booking: Booking,
  from: { date: string; time: string }
): Promise<NotifyResult> {
  return toCustomer(
    booking,
    bookingRescheduledMessage({
      code: booking.code,
      fromDate: from.date,
      fromTime: from.time,
      toDate: booking.bookingDate,
      toTime: booking.bookingTime,
    })
  );
}

/**
 * Toplu bildirim — gün iptalinde.
 *
 * Tek tek gönderilir ve **biri başarısız olsa da diğerleri denenir**: ilk
 * hatada durmak, listenin sonundaki müşterileri sebepsiz habersiz bırakırdı.
 */
export async function notifyCancellations(
  bookings: Booking[],
  weather: boolean
): Promise<{ sent: number; failed: number; firstError: string | null }> {
  let sent = 0;
  let failed = 0;
  let firstError: string | null = null;

  for (const booking of bookings) {
    const result = await notifyCancellation(booking, weather);
    if (result.sent) sent++;
    else if (result.error) {
      failed++;
      firstError ??= result.error;
    }
  }

  return { sent, failed, firstError };
}
