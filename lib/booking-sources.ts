/**
 * Rezervasyon kaynağı ve ödeme biçimi — saf veri.
 *
 * Ayrı dosyada, çünkü bu etiketleri İSTEMCİ bileşenleri de kullanıyor
 * (manuel kayıt formu, Bugün ekranındaki satırlar). `lib/db/bookings.ts`
 * içinde kalsalardı o modülü içe aktarmak veritabanı katmanını ve
 * `node:crypto`'yu istemci paketine çekerdi — derleme bu yüzden kırılıyordu.
 */

/**
 * Rezervasyonun geldiği kanal.
 *
 * İşletmenin bütün kanallarını sisteme almanın asıl sebebi komisyon değil,
 * müsaitliğin doğru olması: telefondan alınan bir rezervasyon sisteme
 * girilmezse RASTLA müşterisine boş görünen saat aslında doludur.
 */
export type BookingSource =
  | 'rastla'
  | 'link'
  | 'instagram'
  | 'whatsapp'
  | 'phone'
  | 'hotel'
  | 'agency'
  | 'manual';

export const BOOKING_SOURCES: BookingSource[] = [
  'rastla',
  'link',
  'instagram',
  'whatsapp',
  'phone',
  'hotel',
  'agency',
  'manual',
];

export const SOURCE_LABELS: Record<BookingSource, string> = {
  rastla: 'RASTLA',
  link: 'Kendi bağlantım',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  phone: 'Telefon',
  hotel: 'Otel',
  agency: 'Acente',
  manual: 'Resepsiyon / elle',
};

export type PaymentMode = 'online' | 'onsite' | 'deposit';

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  online: 'Ödendi',
  onsite: 'Tesiste',
  deposit: 'Kapora',
};
