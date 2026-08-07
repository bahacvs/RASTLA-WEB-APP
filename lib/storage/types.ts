/**
 * Dosya deposu arayüzü.
 *
 * İki uygulama var: `local` (dosya sistemi) ve `vercel-blob`. Arayüzün dar
 * tutulmasının sebebi şu: yüklenen dosyalar **bizim alan adımızdan** sunuluyor
 * (`/gorsel/[id]`), yani depo yalnızca bayt saklıyor. Genel erişime açık bir
 * adres üretmesi gerekmiyor ve istenmiyor da — doğrudan blob adresi verilseydi
 * tarayıcı yeni bir dış host'a istek atardı; bu hem "harita dışında dış istek
 * yok" güvencesini bozar hem de üçüncü bir tarafa kullanıcı IP'si gösterirdi.
 */

/**
 * Baytlar `Buffer` olarak taşınır, `Uint8Array` olarak değil.
 *
 * İkisi de aynı veriyi tutar ama `Buffer`, `ArrayBuffer` destekli olduğu
 * kesin olan tek tip; `Uint8Array<ArrayBufferLike>` `fetch` gövdesine ve
 * `Response` gövdesine doğrudan verilemiyor. Kod zaten yalnızca sunucuda
 * çalışıyor, dolayısıyla Node tipini kullanmanın bir bedeli yok.
 */
export type StoredFile = { body: Buffer; contentType: string };

export interface Storage {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
}

/**
 * Baytları `fetch` ve `Response` gövdesine verilebilir bir görünüme çevirir.
 *
 * Node'un `Buffer` tipi `ArrayBufferLike` üzerinden geneldir ve TypeScript onu
 * `BodyInit` saymaz: tipin `SharedArrayBuffer` üzerinde durma ihtimalini
 * dışlayamıyor. Çalışma zamanında `readFile` ve `sharp` çıktısı her zaman
 * sıradan bir `ArrayBuffer` üzerindedir.
 *
 * **Kopya çıkarmaz** — aynı belleğe bakan yeni bir görünüm üretir. `Uint8Array.from()`
 * de tipi düzeltirdi ama her istekte görselin tamamını kopyalardı.
 */
export function toBody(bytes: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ) as Uint8Array<ArrayBuffer>;
}
