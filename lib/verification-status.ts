/**
 * İşletme doğrulama durumları — saf veri, sunucu bağımlılığı yok.
 *
 * Ayrı dosyada olmasının sebebi somut: bu tip hem sunucu tarafındaki veri
 * katmanında hem de yönetim panelinin istemci bileşenlerinde kullanılıyor.
 * `lib/db/operators.ts` içinden alınsaydı, o modülü içe aktaran istemci
 * bileşeni veritabanı katmanını ve `node:crypto`'yu tarayıcı paketine
 * sürüklerdi — projede derlemeyi bozan hata daha önce tam olarak buydu
 * (bkz. lib/booking-sources.ts, lib/permissions.ts).
 */

export type VerificationStatus =
  | 'basvuru'
  | 'belge_bekleniyor'
  | 'inceleniyor'
  | 'dogrulandi'
  | 'durduruldu'
  | 'kapatildi';

/** Sıra, iş akışının sırası: başvurudan doğrulamaya, oradan sonlanmaya. */
export const VERIFICATION_STATUSES: VerificationStatus[] = [
  'basvuru',
  'belge_bekleniyor',
  'inceleniyor',
  'dogrulandi',
  'durduruldu',
  'kapatildi',
];

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  basvuru: 'Başvuru',
  belge_bekleniyor: 'Belge bekleniyor',
  inceleniyor: 'İnceleniyor',
  dogrulandi: 'Doğrulandı',
  durduruldu: 'Durduruldu',
  kapatildi: 'Kapatıldı',
};

/**
 * Müşteriye rozet gösterilir mi.
 *
 * Tek yerde duruyor: rozet ilan sayfasında çiziliyor, yönetim panelinde
 * "doğrulandı" olarak etiketleniyor ve testte sınanıyor. Üç yerde ayrı ayrı
 * `=== 'dogrulandi'` yazılsaydı, durum listesi değiştiğinde biri geride
 * kalır ve rozet yanlış işletmede görünmeye devam ederdi.
 */
export function showsVerifiedBadge(status: VerificationStatus): boolean {
  return status === 'dogrulandi';
}
