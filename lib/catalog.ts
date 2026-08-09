/**
 * Katalog tipleri ve saf yardımcılar.
 *
 * Bu dosya bilinçli olarak veritabanına dokunmaz: hem sunucu hem istemci
 * bileşenleri güvenle içe aktarabilsin diye. Veritabanı erişimi
 * `lib/db/activities.ts` içindedir ve yalnızca sunucuda çalışır.
 */

export type ActivityCategory =
  | 'jet-ski'
  | 'elektrikli-sup'
  | 'sup'
  | 'kano'
  | 'tekne'
  | 'ruzgar-sorfu';

/**
 * Kapasitenin neyi saydığı. Aktivite bazında işletme belirler — hangi araca
 * kaç kişi güvenli sığar, bunu işletme bilir.
 *   per_person  -> katılımcı sayısı kadar yer düşer
 *   per_booking -> rezervasyon başına 1 yer düşer
 */
export type CapacityMode = 'per_person' | 'per_booking';

export type Review = {
  author: string;
  initial: string;
  timeAgo: string;
  rating: number;
  comment: string;
};

export type Activity = {
  id: string;
  operatorId: string;
  slug: string;
  title: string;
  category: ActivityCategory;
  description?: string;
  priceTRY: number;
  durationMinutes: number;
  /** `durationMinutes` üzerinden türetilmiş görünen etiket ("1 Saat"). */
  durationLabel: string;
  location: string;
  lat: number | null;
  lng: number | null;
  /** Hangi şubede yapılıyor. NULL = şube tanımlanmamış. */
  branchId: string | null;
  capacityMode: CapacityMode;
  /** Seans açılması için gereken en az katılımcı. */
  minParticipants: number;
  /** Seans başlangıcına şu kadar dakika kala rezervasyon kapanır. 0 = sınır yok. */
  bookingCutoffMinutes: number;
  /** Seanslar arası hazırlık payı; slot üretiminde aralığa eklenir. */
  prepMinutes: number;
  /**
   * Peşin alınacak kapora yüzdesi. **null = kapora yok** — ödeme davranışı
   * bugünkü hâliyle kalır (tamamı online ya da tamamı tesiste).
   */
  depositPercent: number | null;
  /**
   * Hava eşikleri. **null = kontrol yok** — varsayılan bir sınır koymak,
   * hiç düşünmemiş bir işletmenin gününü uydurma bir eşik yüzünden riskli
   * göstermek olurdu.
   */
  windLimitKmh: number | null;
  gustLimitKmh: number | null;
  waveLimitM: number | null;
  capacityLabel?: string;
  image: string;
  imageAlt: string;
  gallery?: { src: string; alt: string }[];
  included?: string[];
  safety?: string[];
  meetingPoint?: { image: string; alt: string };
  reviews?: Review[];
  instantConfirm: boolean;
  /**
   * Bugün için kalan toplam yer. Slotlardan hesaplanır; listede "son N yer"
   * uyarısını sürer. Tanımsızsa hesaplanmamış demektir.
   */
  remainingToday?: number;
  rating: number;
  reviewCount: number;
  status: ActivityStatus;
};

/**
 * İlanın yaşam döngüsü.
 *
 * `pending_review` müşteriye GÖRÜNMEZ: yalnızca 'published' listeleniyor.
 * İncelemedeki bir ilanın aramada çıkması, kontrolün hiç yapılmamasıyla aynı
 * kapıya çıkardı.
 *
 * Tip burada, veri katmanında değil: istemci bileşenleri de bu durumu
 * okuyor ve `lib/db/*` içinden alınsaydı veritabanı katmanı tarayıcı
 * paketine girerdi (projede daha önce derlemeyi bozan hata tam olarak buydu).
 */
export type ActivityStatus = 'draft' | 'pending_review' | 'published';

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  draft: 'Taslak',
  pending_review: 'İncelemede',
  published: 'Yayında',
};

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  'jet-ski': 'Jet Ski',
  'elektrikli-sup': 'Elektrikli SUP',
  sup: 'SUP',
  kano: 'Kano',
  tekne: 'Tekne',
  'ruzgar-sorfu': 'Rüzgâr Sörfü',
};

export function isActivityCategory(value: string | undefined): value is ActivityCategory {
  return value !== undefined && value in CATEGORY_LABELS;
}

/** Ana sayfadaki hızlı kategori şeridi. */
export const CATEGORIES: {
  id: ActivityCategory;
  label: string;
  icon: 'speed' | 'surfing' | 'water' | 'rowing' | 'sailing';
}[] = [
  { id: 'jet-ski', label: 'Jet Ski', icon: 'speed' },
  { id: 'elektrikli-sup', label: 'Elek. SUP', icon: 'surfing' },
  { id: 'sup', label: 'SUP', icon: 'water' },
  { id: 'kano', label: 'Kano', icon: 'rowing' },
  { id: 'tekne', label: 'Tekne', icon: 'sailing' },
];

/** Türkçe arama için: aksanları ve büyük/küçük farkını yok sayar. */
export function normalize(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Verilen listeyi metin ve kategoriye göre süzer.
 *
 * Saf bir fonksiyondur ve dışarıdan gelen diziyi işler; bu sayede istemci
 * tarafında anlık filtreleme yapılabilir (arama kutusuna her harfte sunucuya
 * gitmek gerekmez).
 */
export function filterActivities(
  activities: Activity[],
  { query = '', category }: { query?: string; category?: ActivityCategory }
): Activity[] {
  const q = normalize(query.trim());

  return activities.filter((activity) => {
    if (category && activity.category !== category) return false;
    if (!q) return true;

    const haystack = normalize(
      `${activity.title} ${activity.location} ${CATEGORY_LABELS[activity.category]}`
    );
    return q.split(/\s+/).every((term) => haystack.includes(term));
  });
}

/** Ana sayfadaki "Yakınındaki popüler deneyimler" bölümü. */
export const POPULAR_SLUGS = ['premium-jet-ski', 'gun-batimi-sup-turu'];

/** Ana sayfadaki "Bugün Müsait" şeridi. */
export const AVAILABLE_TODAY_SLUGS = ['tekli-kano-kiralama', 'ozel-tekne-turu'];

/** Harita varsayılan görünümü — Büyükçekmece. */
export const MAP_DEFAULT = { lat: 41.0198, lng: 28.5853, zoom: 12 };
