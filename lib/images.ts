import sharp from 'sharp';

/**
 * Yüklenen görselin doğrulanması ve yeniden kodlanması.
 *
 * Dört gerçek risk var ve dördü de burada kapatılıyor:
 *
 *   1. **Sahte içerik türü.** Tarayıcının bildirdiği MIME ve dosya uzantısı
 *      kullanıcı girdisidir; `.jpg` uzantılı bir betik de yüklenebilir.
 *      Bakılan şey dosyanın GERÇEK sihirli baytlarıdır.
 *   2. **Sıkıştırma bombası.** 2 KB'lik bir PNG açıldığında gigabaytlarca
 *      belleğe yayılabilir. Piksel sınırı işleme BAŞLAMADAN uygulanıyor.
 *   3. **EXIF'te konum.** İşletmenin telefonuyla çektiği fotoğraf çekim
 *      koordinatını ve çoğu zaman cihaz seri numarasını taşır. Yeniden
 *      kodlama bunu düşürür. Bu bir mahremiyet meselesi, süsleme değil:
 *      işletme fotoğrafı koyduğunda ev adresini yayımlamış olmamalı.
 *   4. **Boyut.** Ham dosya sınırı ve çıktıda uzun kenar sınırı.
 */

/** Aktivite başına en fazla görsel. */
export const MAX_IMAGES_PER_ACTIVITY = 8;

/** Ham dosya sınırı. Telefon fotoğrafları rahatça sığar. */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

/**
 * Toplam piksel sınırı — sıkıştırma bombasına karşı.
 *
 * 40 megapiksel, bugünün en yüksek çözünürlüklü telefonlarını da kapsar.
 * Bunun üzerindeki bir dosya ya cihazdan gelmiyordur ya da kasten şişirilmiştir.
 */
export const MAX_PIXELS = 40_000_000;

/** Çıktıda uzun kenar. Kahraman görseli için fazlasıyla yeterli. */
const MAX_DIMENSION = 1600;

/** Yeniden kodlama kalitesi. 82, gözle fark edilmeyen ile dosya boyutu arasındaki denge. */
const QUALITY = 82;

export type ImageKind = 'jpeg' | 'png' | 'webp';

/**
 * Dosyanın gerçek türünü sihirli baytlarından okur.
 *
 * Beyan edilen MIME'a bakılmıyor: `Content-Type: image/jpeg` başlığını
 * göndermek isteyen herkes gönderebilir.
 */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, i) => bytes[i] === byte)) return 'png';

  // WEBP: "RIFF" ???? "WEBP"
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  if (riff.every((byte, i) => bytes[i] === byte) && webp.every((byte, i) => bytes[8 + i] === byte)) {
    return 'webp';
  }

  return null;
}

export type ProcessResult =
  | { ok: true; body: Buffer; contentType: string; width: number; height: number; bytes: number }
  | { ok: false; error: string };

/**
 * Görseli doğrular, küçültür ve **tüm üstverisini düşürerek** yeniden kodlar.
 *
 * `sharp` varsayılan olarak üstveriyi taşımaz; `.withMetadata()` çağrılmadığı
 * sürece EXIF, GPS, ICC ve XMP çıktıya geçmez. Bu davranışa bel bağlanıyor ve
 * `verify-uploads.mjs` bunu GPS taşıyan gerçek bir JPEG ile her koşumda
 * doğruluyor — bağımlılığın varsayılanı değişirse test kırılır.
 *
 * Çıktı her zaman WebP: tek bir format, sunma tarafını da doğrulamayı da
 * basitleştiriyor ve aynı kalitede belirgin biçimde küçük.
 */
export async function processImage(input: Uint8Array): Promise<ProcessResult> {
  if (input.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'Dosya 6 MB sınırını aşıyor.' };
  }

  const kind = sniffImage(input);
  if (!kind) {
    // Uzantı ya da MIME değil, içerik reddediyor.
    return { ok: false, error: 'Bu dosya bir JPEG, PNG veya WebP görseli değil.' };
  }

  try {
    // `limitInputPixels` çözme sırasında devreye girer: sınır aşılırsa sharp
    // görüntüyü belleğe açmadan hata verir. Önce metadata okuyup sonra karar
    // vermek geç kalmak olurdu — bomba o okuma sırasında patlar.
    const image = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' });
    const meta = await image.metadata();

    if (!meta.width || !meta.height) {
      return { ok: false, error: 'Görselin boyutları okunamadı.' };
    }
    if (meta.width * meta.height > MAX_PIXELS) {
      return { ok: false, error: 'Görsel çözünürlüğü çok yüksek.' };
    }

    const output = await image
      .rotate() // EXIF yönünü piksellere uygular; sonra üstveri düşeceği için
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: QUALITY })
      .toBuffer({ resolveWithObject: true });

    return {
      ok: true,
      body: output.data,
      contentType: 'image/webp',
      width: output.info.width,
      height: output.info.height,
      bytes: output.data.byteLength,
    };
  } catch (error) {
    // Bozuk ya da kasten hatalı bir dosya buraya düşer. Ayrıntı kullanıcıya
    // gösterilmiyor; sağlayıcı hata metni bazen dosya yolu içeriyor.
    console.error('[gorsel] işlenemedi:', error);
    return { ok: false, error: 'Görsel işlenemedi. Başka bir dosya deneyin.' };
  }
}
