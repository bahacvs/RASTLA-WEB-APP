import QRCode from 'qrcode';
import { getActiveLink } from '@/lib/db/booking-links';
import { SITE_URL } from '@/lib/site';

/**
 * Paylaşım linkinin QR'ı — indirilebilir PNG.
 *
 * Sayfada zaten SVG gömülü olarak görünüyor; bu uç **baskı** için var:
 * matbaaya, tabelaya, masa kartına gidecek dosya. SVG'yi sağ tıkla kaydetmek
 * her tarayıcıda aynı çalışmıyor, matbaalar da çoğunlukla PNG istiyor.
 *
 * QR'ın içeriği **sunucuda kuruluyor**: uç yalnızca kodu alıyor, adresi
 * kendisi üretiyor. Serbest metin alsaydı herkesin istediği içeriği bizim
 * alan adımızdan QR'a çevirebileceği bir servis açmış olurduk — o QR'ı
 * tarayan kişi RASTLA'ya güvenip başka bir yere gitmiş olurdu.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ kod: string }> }) {
  const { kod } = await params;

  const link = await getActiveLink(kod);
  if (!link) return new Response('Bulunamadı', { status: 404 });

  const png = await QRCode.toBuffer(`${SITE_URL}/r/${link.code}`, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    // Baskı için yeterli çözünürlük: 1024 px kenar, 8 cm'de ~325 dpi.
    width: 1024,
    color: { dark: '#102334', light: '#ffffff' },
  });

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="rastla-${link.code}.png"`,
      // Kod değişmiyor, içerik de değişmiyor; tarayıcı bir daha sormasın.
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
