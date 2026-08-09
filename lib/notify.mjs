import { getUser } from './db/users.ts';
import { sendSms } from './sms/index.ts';
import { bookingCancelledMessage, bookingRescheduledMessage } from './sms/messages.ts';

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
 *
 * Düz ESM (`lib/db/capacity.mjs`, `lib/alerts/index.mjs` ile aynı gerekçe):
 * doğrulama betiği bu yolu düğüm süreci olarak çağırıyor ve TypeScript modülünü
 * doğrudan yükleyemiyor. İçe aktarmalar uzantılı — düğümün çözebilmesi için.
 *
 * @typedef {{ sent: boolean, error: string|null }} NotifyResult
 */

/**
 * Rezervasyonun sahibine mesaj gönderir.
 *
 * Silinmiş hesaplara gönderilmez: `deleteUser` telefonu geri döndürülemez bir
 * yer tutucuyla değiştiriyor ve o yer tutucu bir numara değil. Kontrol
 * edilmeseydi her iptalde sağlayıcıya anlamsız bir dizgi gönderilirdi.
 *
 * @param {{ userId: string, code: string, bookingDate: string, bookingTime: string }} booking
 * @param {string} message
 * @returns {Promise<NotifyResult>}
 */
async function toCustomer(booking, message) {
  const user = await getUser(booking.userId);
  if (!user || user.deletedAt) return { sent: false, error: null };

  const result = await sendSms(user.phone, message);
  return result.ok ? { sent: true, error: null } : { sent: false, error: result.error };
}

/**
 * @param {{ userId: string, code: string, bookingDate: string, bookingTime: string }} booking
 * @param {boolean} weather
 * @returns {Promise<NotifyResult>}
 */
export async function notifyCancellation(booking, weather) {
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

/**
 * @param {{ userId: string, code: string, bookingDate: string, bookingTime: string }} booking
 * @param {{ date: string, time: string }} from
 * @returns {Promise<NotifyResult>}
 */
export async function notifyReschedule(booking, from) {
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
 *
 * @param {{ userId: string, code: string, bookingDate: string, bookingTime: string }[]} bookings
 * @param {boolean} weather
 * @returns {Promise<{ sent: number, failed: number, firstError: string|null }>}
 */
export async function notifyCancellations(bookings, weather) {
  let sent = 0;
  let failed = 0;
  /** @type {string|null} */
  let firstError = null;

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
