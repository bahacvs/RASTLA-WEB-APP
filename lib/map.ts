/**
 * Harita yapılandırması.
 *
 * DİKKAT — bu, uygulamanın tek dış çalışma zamanı bağımlılığıdır. Font,
 * ikon ve görsellerin hepsi repoda; ama harita karoları bir sağlayıcıdan
 * gelmek zorunda ve bunun kaçışı yok. `scripts/verify-offline.mjs` yalnızca
 * bu host'a izin verir, başka dış isteği hata sayar.
 *
 * Sonuçları: sağlayıcı kullanıcı IP'lerini görür (KVKK aydınlatma metninde
 * yer almalı) ve bir API anahtarı gerekir.
 */

export const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

export const isMapEnabled = MAPTILER_KEY.length > 0;

/** Karoların geldiği host — ağ izolasyon testinin izin verdiği tek dış adres. */
export const TILE_HOST = 'api.maptiler.com';

/**
 * MapLibre worker'ının adresi — kendi alan adımızdan.
 *
 * Kütüphane bu adresi normalde `import.meta.url`'den türetiyor ama paketleme
 * sonrası o değer bir http(s) adresi olmadığı için boş dize dönüyor ve worker
 * sayfanın kendisini JavaScript sanıp sessizce ölüyor. Sonuç: karolar hiç
 * istenmiyor, harita boş görünüyor, hata da üretilmiyor.
 *
 * Dosyalar `scripts/copy-maplibre-worker.mjs` ile derleme öncesinde
 * `public/maplibre/` altına kopyalanır.
 */
export const WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

/**
 * Buluşma noktasına yol tarifi bağlantısı.
 *
 * Kasıtlı olarak bir SDK değil, düz bir bağlantı. Google Haritalar'ın
 * evrensel adresi telefonda kurulu uygulamayı açar, yoksa tarayıcıya düşer;
 * iOS ve Android'de aynı şekilde çalışır.
 *
 * Gizlilik açısından farkı önemli: bu adres **kullanıcı dokunmadıkça hiçbir
 * istek üretmez.** Sayfalarımızdan Google'a giden bir çağrı yok, dolayısıyla
 * "harita sağlayıcısı dışında dış istek yok" güvencesi ve aydınlatma metni
 * olduğu gibi kalıyor. Bağlantıya `noreferrer` konuyor ki hangi sayfadan
 * gelindiği de aktarılmasın.
 *
 * Hedef isim değil koordinat: buluşma noktaları iskele ve barınak gibi
 * yerler, ada göre arama yanlış yere götürebilir.
 */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function styleUrl(): string {
  return `https://${TILE_HOST}/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;
}

/** Varsayılan görünüm: Büyükçekmece. */
export const MAP_DEFAULT = { lat: 41.0198, lng: 28.5853, zoom: 12 };
