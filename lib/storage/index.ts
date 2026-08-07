import { localStorage } from './local';
import { isBlobConfigured, vercelBlobStorage } from './vercel-blob';
import type { Storage } from './types';

export * from './types';

/**
 * Depo seçimi.
 *
 *   STORAGE_PROVIDER=local     -> her koşulda dosya sistemi
 *   BLOB_READ_WRITE_TOKEN var  -> Vercel Blob
 *   hiçbiri                    -> dosya sistemi
 *
 * Varsayılanın dosya sistemi olması bilinçli: geliştirme ve doğrulama
 * betikleri hiçbir dış hesap gerektirmemeli. Üretimde bunun yeterli
 * OLMADIĞI KURULUM.md'de açıkça yazılı — sunucusuz ortamda yazılan dosya
 * kalıcı değildir.
 */

let cached: Storage | null = null;

export function storage(): Storage {
  if (cached) return cached;

  if (process.env.STORAGE_PROVIDER === 'local') {
    cached = localStorage();
  } else if (isBlobConfigured()) {
    cached = vercelBlobStorage();
  } else {
    cached = localStorage();
  }

  return cached;
}

export function resetStorage(): void {
  cached = null;
}
