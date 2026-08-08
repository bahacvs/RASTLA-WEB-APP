/**
 * RASTLA'nın varsayılan komisyon payı — TEK KAYNAK.
 *
 * Üç yer bu sayıyı söylüyor: veritabanı varsayılanı (lib/db/index.mjs),
 * işletmeye gösterilen hak ediş ekranı ve /partner sayfasındaki tanıtım
 * metni. Ayrı ayrı yazılsaydı biri değişip diğerleri geride kalırdı ve
 * **açılış sayfasında yazan oranla fiilen kesilen oran birbirini tutmazdı** —
 * bu, ticari bir yanlış beyan olurdu.
 *
 * Düz `.mjs`: zamanlanmış işler ve kurulum betikleri düğüm betiği olarak
 * çalışıyor ve TypeScript modülü yükleyemiyor (bkz. lib/password.mjs,
 * lib/db/index.mjs). Aynı sabiti hem onlar hem de uygulama okuyor.
 *
 * On binde tutuluyor: kuruş hesabında kayan nokta yuvarlaması, zamanla
 * mutabakatı bozan türden sessiz hatalara yol açar.
 */
export const DEFAULT_COMMISSION_BP = 1800;

/** Eski varsayılan. "Kimse elle belirlemedi" demek; göç bunu yükseltiyor. */
export const PREVIOUS_COMMISSION_BP = 1000;

/** Yüzde olarak okunabilir biçim: 1800 -> "18", 1850 -> "18,5". */
export function commissionPercentLabel(bp = DEFAULT_COMMISSION_BP) {
  return (bp / 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}
