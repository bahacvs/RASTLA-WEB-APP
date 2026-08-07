import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Storage, StoredFile } from './types';

/**
 * Dosya sistemi deposu — geliştirme ve tek sunuculu kurulumlar için.
 *
 * **Vercel'in sunucusuz ortamında KALICI DEĞİLDİR.** Yazılan dosya bir sonraki
 * dağıtımda ya da soğuk başlatmada kaybolur. `DATABASE_URL` için geçerli olan
 * uyarının aynısı burada da geçerli; üretimde `BLOB_READ_WRITE_TOKEN` verilmeli.
 */

function root(): string {
  return resolve(process.env.UPLOAD_PATH ?? join(process.cwd(), 'data', 'gorseller'));
}

/**
 * Anahtarı kök dizinin İÇİNDE bir yola çevirir.
 *
 * Anahtarlar sunucuda üretiliyor, yani bugün kullanıcı girdisi değil. Yine de
 * doğrulanıyor: bu fonksiyon ileride başka bir çağıran kazanabilir ve
 * "../../etc/passwd" gibi bir anahtar dizin dışına yazmayı mümkün kılardı.
 * Kontrolün maliyeti bir karşılaştırma.
 */
function pathFor(key: string): string {
  const base = root();
  const full = resolve(join(base, key));
  if (full !== base && !full.startsWith(`${base}/`)) {
    throw new Error('Geçersiz depo anahtarı.');
  }
  return full;
}

export function localStorage(): Storage {
  return {
    name: 'local',

    // İçerik türü burada kullanılmıyor: dosya sistemi tür bilgisi taşımaz ve
    // tür zaten veritabanında duruyor. Arayüzün parçası olmasının sebebi
    // Vercel Blob'un onu bir başlık olarak istemesi.
    async put(key, body) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },

    async get(key): Promise<StoredFile | null> {
      try {
        // İçerik türü veritabanında; depo yalnızca bayt tutuyor. Çağıran
        // taraf doğru türü zaten biliyor ve başlığı ona göre yazıyor.
        return { body: await readFile(pathFor(key)), contentType: 'application/octet-stream' };
      } catch {
        return null;
      }
    },

    async delete(key) {
      try {
        await unlink(pathFor(key));
      } catch {
        // Zaten yoksa iş tamam; silme idempotent olmalı.
      }
    },
  };
}
