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
 * Mesajlar bilinçli olarak Türkçe karaktersiz.
 *
 * GSM 03.38 alfabesinde ş, ğ, ı, İ yok; bu harfler mesajı UCS-2'ye düşürür ve
 * karakter sınırı 160'tan 70'e iner — yani tek mesaj iki kredi olur ve bazı
 * eski cihazlarda bozuk görünür. Doğrulama kodu için okunabilirlik yeterli.
 */
export const ALPHABET_NOTE = 'GSM 03.38';
