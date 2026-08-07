import { toBody, type Storage, type StoredFile } from './types';

/**
 * Vercel Blob deposu.
 *
 * Resmî `@vercel/blob` paketi yerine düz `fetch`: ihtiyacımız olan üç uç için
 * bir bağımlılık daha eklemek gereksiz, ve hangi isteğin nereye gittiğinin
 * görülebilir olması bu projede tekrar eden bir tercih (bkz. lib/mail,
 * lib/payments/iyzico).
 *
 * Dosyalar `addRandomSuffix=false` ile yazılıyor: anahtarı biz üretiyoruz ve
 * zaten rastgele. Sağlayıcının ikinci bir sonek eklemesi, anahtarı
 * veritabanındakiyle uyuşmaz hâle getirirdi.
 */

const API = 'https://blob.vercel-storage.com';

function token(): string {
  return process.env.BLOB_READ_WRITE_TOKEN ?? '';
}

export function isBlobConfigured(): boolean {
  return token().length > 0;
}

export function vercelBlobStorage(): Storage {
  return {
    name: 'vercel-blob',

    async put(key, body, contentType) {
      const response = await fetch(`${API}/${key}`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${token()}`,
          'content-type': contentType,
          'x-content-type': contentType,
          'x-add-random-suffix': '0',
          // Görsel içeriği bir kez yazılıp bir daha değişmiyor; anahtar
          // değişmeden içerik değişmediği için uzun önbellek güvenli.
          'x-cache-control-max-age': '31536000',
        },
        body: toBody(body),
      });

      if (!response.ok) {
        throw new Error(`Blob yazılamadı (${response.status}): ${(await response.text()).slice(0, 200)}`);
      }
    },

    async get(key): Promise<StoredFile | null> {
      // Okuma, yazarken dönen genel adres üzerinden değil, aynı anahtardan
      // türetilerek yapılır. Adresi veritabanında saklamak, sağlayıcı alan adı
      // değiştiğinde bütün kayıtları geçersiz kılardı.
      const listed = await fetch(`${API}?prefix=${encodeURIComponent(key)}&limit=1`, {
        headers: { authorization: `Bearer ${token()}` },
      });
      if (!listed.ok) return null;

      const body = (await listed.json()) as { blobs?: { url?: string; pathname?: string }[] };
      const match = body.blobs?.find((b) => b.pathname === key);
      if (!match?.url) return null;

      const file = await fetch(match.url);
      if (!file.ok) return null;

      return {
        body: Buffer.from(await file.arrayBuffer()),
        contentType: file.headers.get('content-type') ?? 'application/octet-stream',
      };
    },

    async delete(key) {
      const listed = await fetch(`${API}?prefix=${encodeURIComponent(key)}&limit=1`, {
        headers: { authorization: `Bearer ${token()}` },
      });
      if (!listed.ok) return;

      const body = (await listed.json()) as { blobs?: { url?: string; pathname?: string }[] };
      const match = body.blobs?.find((b) => b.pathname === key);
      if (!match?.url) return;

      await fetch(`${API}/delete`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ urls: [match.url] }),
      });
    },
  };
}
