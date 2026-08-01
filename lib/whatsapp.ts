/**
 * Pilot dönemi rezervasyon kanalı.
 *
 * Ödeme altyapısı ve rezervasyon veritabanı devreye girene kadar rezervasyon
 * talepleri WhatsApp üzerinden, elle karşılanıyor. Bu dosya o köprüyü kurar:
 * kullanıcının ekranda yaptığı seçimler hazır bir mesaja dönüşür.
 *
 * Numara `NEXT_PUBLIC_WHATSAPP_NUMBER` ile verilir (uluslararası biçim, yalnızca
 * rakam — ör. 905XXXXXXXXX). Tanımlı değilse pilot kanalı kapalı sayılır ve
 * arayüz bozuk bir bağlantı göstermek yerine bunu açıkça belirtir.
 */

export const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');

export const isPilotBookingEnabled = WHATSAPP_NUMBER.length > 0;

/**
 * Mesaja eklenecek aktivite bağlantısının kökü (`NEXT_PUBLIC_SITE_URL`).
 *
 * Bilinçli olarak `window.location` kullanılmıyor: bu değer sunucu ve istemci
 * render'ında farklı çıkar ve hydration uyuşmazlığı yaratır. Tanımsızsa mesaja
 * bağlantı eklenmez.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');

export function activityUrl(slug: string): string | undefined {
  return SITE_URL ? `${SITE_URL}/aktivite/${slug}` : undefined;
}

export type BookingRequest = {
  activityTitle: string;
  activityUrl?: string;
  dateLabel: string | null;
  timeLabel: string | null;
  adults: number;
  children: number;
  totalLabel: string;
};

/** Talebi işletmenin tek bakışta okuyabileceği düz bir mesaja çevirir. */
export function buildBookingMessage(request: BookingRequest): string {
  const lines = [
    'Merhaba, RASTLA üzerinden rezervasyon talebi:',
    '',
    `Aktivite: ${request.activityTitle}`,
    `Tarih: ${request.dateLabel ?? '—'}`,
    `Saat: ${request.timeLabel ?? '—'}`,
    `Katılımcı: ${request.adults} yetişkin${request.children > 0 ? `, ${request.children} çocuk` : ''}`,
    `Tahmini tutar: ${request.totalLabel}`,
  ];

  if (request.activityUrl) {
    lines.push('', request.activityUrl);
  }

  return lines.join('\n');
}

/** wa.me derin bağlantısı. Pilot kanalı kapalıysa null döner. */
export function buildWhatsAppUrl(request: BookingRequest): string | null {
  if (!isPilotBookingEnabled) return null;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildBookingMessage(request))}`;
}
