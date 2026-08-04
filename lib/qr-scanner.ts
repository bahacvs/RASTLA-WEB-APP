import jsQR from 'jsqr';

/**
 * QR çözücü seçimi.
 *
 * `BarcodeDetector` yalnızca Chromium tabanlı tarayıcılarda var; Safari'de
 * yok. İşletme sahiplerinin çoğu sahilde telefon kullanacağı ve bunların bir
 * kısmı iPhone olacağı için tek başına yeterli değildi — o cihazlarda kodu
 * elle yazmak gerekiyordu.
 *
 * Bu yüzden iki yol var: donanım hızlandırmalı yerleşik çözücü varsa o,
 * yoksa jsQR ile yazılımsal çözme. jsQR bağımlılığı olmayan yerel bir paket,
 * dolayısıyla dışarı istek atmaz.
 */

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export type QrDecoder = {
  /** Videodan bir kare okur; kod bulunamazsa null döner. */
  scan: (video: HTMLVideoElement) => Promise<string | null>;
  /** Hangi yolun kullanıldığı — arayüzde bilgilendirme için. */
  kind: 'native' | 'jsqr';
};

function nativeDecoder(): QrDecoder | null {
  if (typeof window === 'undefined' || !window.BarcodeDetector) return null;

  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

  return {
    kind: 'native',
    async scan(video) {
      try {
        const codes = await detector.detect(video);
        return codes[0]?.rawValue ?? null;
      } catch {
        // Tek bir karede okuma başarısız olabilir; çağıran döngüye devam eder.
        return null;
      }
    },
  };
}

function jsQrDecoder(): QrDecoder {
  // Kareler bu tuvale çizilip piksel verisi jsQR'a verilir.
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  return {
    kind: 'jsqr',
    async scan(video) {
      if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) return null;

      // Çözünürlüğü sınırlamak CPU'yu belirgin şekilde rahatlatır ve bilet
      // QR'ı için fazlasıyla yeterli kalır.
      const scale = Math.min(1, 640 / (video.videoWidth || 640));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      if (canvas.width === 0 || canvas.height === 0) return null;

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);

      const result = jsQR(image.data, image.width, image.height, {
        inversionAttempts: 'dontInvert',
      });
      return result?.data ?? null;
    },
  };
}

/** Cihazda çalışan en iyi çözücüyü döner. Her tarayıcıda bir sonuç verir. */
export function createQrDecoder(): QrDecoder {
  return nativeDecoder() ?? jsQrDecoder();
}
