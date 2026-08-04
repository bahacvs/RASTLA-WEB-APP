import QRCode from 'qrcode';

/**
 * Bilet QR'ını sunucuda SVG olarak üretir.
 *
 * SVG doğrudan sayfaya gömülür: dış servise istek gitmez, istemciye ek
 * JavaScript inmez ve yazdırıldığında da net kalır.
 */
export async function TicketQr({ value, size = 220 }: { value: string; size?: number }) {
  const svg = await QRCode.toString(value, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#102334', light: '#ffffff' },
  });

  return (
    <div
      aria-label="Bilet QR kodu"
      role="img"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg.replace('<svg', '<svg width="100%" height="100%"') }}
    />
  );
}
