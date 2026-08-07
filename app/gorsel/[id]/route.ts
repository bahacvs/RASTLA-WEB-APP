import { getImage } from '@/lib/db/activity-images';
import { storage, toBody } from '@/lib/storage';

/**
 * Yüklenen görselleri **kendi alan adımızdan** sunar.
 *
 * Doğrudan blob adresi verilseydi tarayıcı yeni bir dış host'a istek atardı.
 * Bunun iki bedeli olurdu: `verify-offline.mjs`'in koruduğu "harita dışında
 * dış istek yok" güvencesi bozulur, ve üçüncü bir taraf her ziyaretçinin IP
 * adresini görürdü. Karşılığında fazladan bant genişliği ödüyoruz; bilinçli
 * bir tercih.
 *
 * Önbellek `immutable`: görselin içeriği bir kez yazılır ve kimliği değişmeden
 * değişmez. Yeni fotoğraf yeni bir kimlik alır, dolayısıyla bayat içerik
 * gösterme riski yok.
 */

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const image = await getImage(id);
  if (!image) return new Response('Bulunamadı', { status: 404 });

  const file = await storage().get(image.storageKey);
  if (!file) {
    // Kayıt var ama dosya yok: depo değişmiş ya da silinmiş olabilir.
    // Sessizce boş bir görsel dönmek yerine görünür bir hata bırakılır.
    console.error('[gorsel] kayıt var, dosya yok:', image.storageKey);
    return new Response('Bulunamadı', { status: 404 });
  }

  return new Response(toBody(file.body), {
    headers: {
      // İçerik türü depodan değil KAYITTAN okunur: depo yalnızca bayt tutuyor
      // ve yerel depo tür bilgisi taşımıyor.
      'content-type': image.contentType,
      'content-length': String(file.body.byteLength),
      'cache-control': 'public, max-age=31536000, immutable',
      // Görselin başka bir siteye gömülmesini engellemek için değil, tarayıcının
      // içeriği tahmin etmeye çalışmasını engellemek için.
      'x-content-type-options': 'nosniff',
    },
  });
}
