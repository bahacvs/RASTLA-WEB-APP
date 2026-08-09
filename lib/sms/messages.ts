/**
 * SMS şablonları.
 *
 * **Buraya pazarlama içeriği eklemeyin.** Kampanya, indirim duyurusu ya da
 * "bizi takip edin" gibi tek bir cümle, mesajın tamamını 6563 sayılı Kanun
 * anlamında **ticari ileti** hâline getirir; o zaman İYS onayı gerekir ve
 * onaysız gönderim idari para cezasına tabidir.
 *
 * Buradaki mesajlar yalnızca kullanıcının kendi başlattığı bir işlemin
 * karşılığıdır: doğrulama kodu ve işlem bildirimi.
 */

const BRAND = 'RASTLA';

/** Misafirin rezervasyon öncesi numara doğrulaması. */
export function bookingCodeMessage(code: string): string {
  return `${BRAND} dogrulama kodunuz: ${code}. Kodu kimseyle paylasmayin. 5 dakika gecerlidir.`;
}

/** İşletme personelinin girişteki ikinci faktörü. */
export function operatorCodeMessage(code: string): string {
  return `${BRAND} isletme giris kodunuz: ${code}. Bu kodu siz istemediyseniz parolanizi degistirin.`;
}

/**
 * Rezervasyon iptal edildi.
 *
 * İŞLEM BİLDİRİMİ, ticari ileti değil: müşterinin kendi başlattığı bir
 * sözleşmenin sona erdiğini haber veriyor. "Başka aktivitelere de bakın" gibi
 * tek bir cümle eklenirse mesaj 6563 anlamında ticari ileti hâline gelir ve
 * onaysız gönderim cezaya tabi olur (bkz. dosya başındaki not).
 *
 * İadenin ne zaman görüneceği yazılmıyor: süre bankaya göre değişiyor ve
 * tutturulamayacak bir söz vermek, hiç söz vermemekten kötü.
 */
export function bookingCancelledMessage(input: {
  code: string;
  date: string;
  time: string;
  weather: boolean;
}): string {
  const why = input.weather ? 'hava kosullari nedeniyle ' : '';
  return (
    `${BRAND}: ${input.date} ${input.time} rezervasyonunuz (${input.code}) ${why}iptal edildi. ` +
    `Odemeniz varsa tamami iade edilecektir.`
  );
}

/** Rezervasyon başka bir saate taşındı. */
export function bookingRescheduledMessage(input: {
  code: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
}): string {
  return (
    `${BRAND}: ${input.fromDate} ${input.fromTime} rezervasyonunuz (${input.code}) ` +
    `${input.toDate} ${input.toTime} saatine alindi. Biletiniz ayni kod ile gecerli.`
  );
}

/**
 * Mesajlar bilinçli olarak Türkçe karaktersiz.
 *
 * GSM 03.38 alfabesinde ş, ğ, ı, İ yok; bu harfler mesajı UCS-2'ye düşürür ve
 * karakter sınırı 160'tan 70'e iner — yani tek mesaj iki kredi olur ve bazı
 * eski cihazlarda bozuk görünür. Doğrulama kodu için okunabilirlik yeterli.
 */
export const ALPHABET_NOTE = 'GSM 03.38';
