/**
 * Konum ve mesafe.
 *
 * DİKKAT — buradaki her şey **tarayıcıda** çalışır ve öyle kalmalıdır.
 *
 * Kullanıcının koordinatı sunucuya gönderilmiyor, hiçbir yere yazılmıyor,
 * hiçbir günlüğe düşmüyor. Sebebi teknik değil hukuki: konum, KVKK anlamında
 * kişisel veridir ve aktivitelerin tamamı zaten istemcide olduğu için mesafeyi
 * orada hesaplamak hiçbir şey kaybettirmiyor. Sunucuya gönderseydik saklama
 * süresi, aydınlatma metni, ihlal senaryosu ve silme talebi — dördü birden
 * gündeme gelirdi. Toplanmayan veri, korunması gerekmeyen veridir.
 *
 * Bu dosyaya sunucu tarafı bir çağrı eklenecekse, yukarıdaki cümlenin de
 * değişmesi gerekir.
 */

export type Coords = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * İki nokta arasındaki kuş uçuşu mesafe (km) — haversine.
 *
 * Kuş uçuşu bilinçli: yürüme/sürüş mesafesi bir rota servisi ister ve o da
 * yeni bir dış bağımlılık demek. Sıralama için kuş uçuşu fazlasıyla yeterli;
 * Büyükçekmece ölçeğinde sıralamayı bozacak bir sapma üretmiyor.
 */
export function distanceKm(a: Coords, b: Coords): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Mesafeyi okunur hâle getirir.
 *
 * 1 km altında metre gösteriliyor ve 50'ye yuvarlanıyor: GPS'in kendi hata
 * payı zaten bu mertebede, "327 m" yazmak sahip olmadığımız bir kesinlik
 * iddia etmek olurdu.
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round((km * 1000) / 50) * 50} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/**
 * Aktiviteleri kullanıcıya yakınlıktan uzağa sıralar.
 *
 * Koordinatı olmayanlar **sona** atılır, elenmez: işletme konum girmediyse
 * bu ilanın suçu değil ve aramadan tamamen düşmesi kullanıcıyı da işletmeyi
 * de cezalandırırdı.
 *
 * Sıralama kararlı: eşit mesafedekiler girdi sırasını korur.
 */
export function sortByDistance<T extends { lat: number | null; lng: number | null }>(
  items: T[],
  from: Coords
): { item: T; km: number | null }[] {
  return items
    .map((item, index) => ({
      item,
      index,
      km: item.lat !== null && item.lng !== null ? distanceKm(from, { lat: item.lat, lng: item.lng }) : null,
    }))
    .sort((a, b) => {
      if (a.km === null && b.km === null) return a.index - b.index;
      if (a.km === null) return 1;
      if (b.km === null) return -1;
      return a.km === b.km ? a.index - b.index : a.km - b.km;
    })
    .map(({ item, km }) => ({ item, km }));
}
