/**
 * Prototip ekranlarındaki içeriğin tek kaynağı.
 *
 * Prototiplerde bu veriler HTML'e gömülüydü ve aynı aktivite birden fazla
 * sayfada tekrarlanıyordu. Gerçek bir veri katmanı (API/veritabanı) devreye
 * girene kadar tüm ekranlar buradan besleniyor.
 */

export type ActivityCategory =
  | 'jet-ski'
  | 'elektrikli-sup'
  | 'sup'
  | 'kano'
  | 'tekne'
  | 'ruzgar-sorfu';

export type Review = {
  author: string;
  initial: string;
  timeAgo: string;
  rating: number;
  comment: string;
};

export type Activity = {
  slug: string;
  title: string;
  category: ActivityCategory;
  /** Kişi başı fiyat (TL). Biçimlendirme için lib/format.ts kullanılır. */
  priceTRY: number;
  durationLabel: string;
  location: string;
  rating: number;
  reviewCount: number;
  /** Liste ve kart görünümlerinde kullanılan ana görsel. */
  image: string;
  imageAlt: string;
  /** Detay sayfasındaki kaydırmalı galeri. Boşsa ana görsel kullanılır. */
  gallery?: { src: string; alt: string }[];
  instantConfirm: boolean;
  /** Doluluk uyarısı ("Sadece 2 Kaldı"). Tanımsızsa uyarı gösterilmez. */
  spotsLeft?: number;
  operator?: string;
  capacityLabel?: string;
  description?: string;
  included?: string[];
  safety?: string[];
  meetingPoint?: { image: string; alt: string };
  timeSlots?: { time: string; note?: string }[];
  reviews?: Review[];
};

export const ACTIVITIES: Activity[] = [
  {
    slug: 'elektrikli-sup-deneyimi',
    title: 'RASTLA Elektrikli SUP Deneyimi',
    category: 'elektrikli-sup',
    priceTRY: 600,
    durationLabel: '1 Saat',
    location: 'Büyükçekmece Sahili',
    rating: 4.9,
    reviewCount: 128,
    image: '/images/sup-coastline.jpg',
    imageAlt: 'Güneşli bir kıyı yakınında sakin mavi sularda kürek süren bir kişi',
    gallery: [
      {
        src: '/images/esup-action.jpg',
        alt: 'Berrak sular üzerinde elektrikli SUP kullanan bir kişi',
      },
      {
        src: '/images/esup-motor-detail.jpg',
        alt: 'Modern bir elektrikli SUP’un motor detayının yakın çekimi',
      },
      {
        src: '/images/esup-group-sunset.jpg',
        alt: 'Gün batımında elektrikli SUP ile eğlenen bir arkadaş grubu',
      },
    ],
    instantConfirm: true,
    operator: 'Büyükçekmece Water Sports Center',
    capacityLabel: '1-5 Kişi',
    description:
      'Sakin suların tadını yeni nesil teknolojiyle çıkarın. Yorulmadan süzülün. RASTLA Elektrikli SUP Deneyimi, hem yeni başlayanlar hem de tecrübeliler için mükemmel bir su sporu macerası sunar. Sessiz motoru sayesinde doğanın keyfini çıkarırken efor sarf etmeden uzun mesafeler kat edebilirsiniz.',
    included: ['Can yeleği', 'Temel eğitim', 'Su geçirmez çanta'],
    safety: ['Profesyonel eğitmen eşliği', 'Kask temini', 'GPS takip sistemi'],
    meetingPoint: {
      image: '/images/map-meeting-point.jpg',
      alt: 'Büyükçekmece kıyı bölgesini gösteren sade, açık temalı harita kesiti',
    },
    timeSlots: [
      { time: '09:00' },
      { time: '11:00' },
      { time: '15:00' },
      { time: '18:30', note: 'Gün Batımı' },
    ],
    reviews: [
      {
        author: 'Ayşe Y.',
        initial: 'A',
        timeAgo: '2 hafta önce',
        rating: 5,
        comment:
          'Harika bir deneyimdi! Eğitmenler çok ilgiliydi ve ekipmanlar yepyeniydi. Kesinlikle tavsiye ederim.',
      },
    ],
  },
  {
    slug: 'premium-jet-ski',
    title: 'Premium Jet Ski Kiralama',
    category: 'jet-ski',
    priceTRY: 1200,
    durationLabel: '30 Dk',
    location: 'Büyükçekmece Sahil',
    rating: 4.9,
    reviewCount: 124,
    image: '/images/jetski-hero.jpg',
    imageAlt: 'Parlak mavi deniz üzerinde hızla ilerleyen bir jet ski',
    instantConfirm: true,
    capacityLabel: '1-2 Kişi',
    timeSlots: [{ time: '10:00' }, { time: '12:00' }, { time: '14:00' }, { time: '16:00' }],
  },
  {
    slug: 'gun-batimi-sup-turu',
    title: 'Gün Batımı SUP Turu',
    category: 'sup',
    priceTRY: 450,
    durationLabel: '1 Saat',
    location: 'Mimaroba Koyu',
    rating: 4.7,
    reviewCount: 89,
    image: '/images/sup-sunset.jpg',
    imageAlt: 'Gün batımında sakin sularda kürek süren bir kişi',
    instantConfirm: false,
    capacityLabel: '1-8 Kişi',
    timeSlots: [{ time: '17:00' }, { time: '18:30', note: 'Gün Batımı' }],
  },
  {
    slug: 'ruzgar-sorfu-baslangic',
    title: 'Başlangıç Seviyesi Rüzgar Sörfü',
    category: 'ruzgar-sorfu',
    priceTRY: 1200,
    durationLabel: '2 Saat',
    location: 'Mimarsinan Marina',
    rating: 4.7,
    reviewCount: 85,
    image: '/images/windsurf-action.jpg',
    imageAlt: 'Öğleden sonra dalgalar üzerinde ilerleyen bir rüzgâr sörfçüsü',
    instantConfirm: false,
    spotsLeft: 2,
    capacityLabel: '1-4 Kişi',
    timeSlots: [{ time: '10:00' }, { time: '13:00' }],
  },
  {
    slug: 'tekli-kano-kiralama',
    title: 'Tekli Kano Kiralama',
    category: 'kano',
    priceTRY: 250,
    durationLabel: '1 Saat',
    location: 'Büyükçekmece Sahili',
    rating: 4.6,
    reviewCount: 52,
    image: '/images/kayaks-beach.jpg',
    imageAlt: 'Kumsalda duran renkli kanolar ve arkada berrak deniz',
    instantConfirm: true,
    capacityLabel: '1 Kişi',
    timeSlots: [{ time: '09:00' }, { time: '11:00' }, { time: '14:00' }],
  },
  {
    slug: 'ozel-tekne-turu',
    title: 'Özel Tekne Turu (2 Saat)',
    category: 'tekne',
    priceTRY: 3500,
    durationLabel: '2 Saat',
    location: 'Mimarsinan Marina',
    rating: 4.8,
    reviewCount: 41,
    image: '/images/boat-aerial.jpg',
    imageAlt: 'Kıyı boyunca ilerleyen küçük beyaz teknenin havadan görüntüsü',
    instantConfirm: true,
    capacityLabel: '1-10 Kişi',
    timeSlots: [{ time: '11:00' }, { time: '15:00' }],
  },
];

export function getActivity(slug: string): Activity | undefined {
  return ACTIVITIES.find((a) => a.slug === slug);
}

/** Ana sayfadaki "Yakınındaki popüler deneyimler" bölümü. */
export const POPULAR_SLUGS = ['premium-jet-ski', 'gun-batimi-sup-turu'];

/** Ana sayfadaki "Bugün Müsait" şeridi — anında onaylanan kısa aktiviteler. */
export const AVAILABLE_TODAY_SLUGS = ['tekli-kano-kiralama', 'ozel-tekne-turu'];

/** Arama sonuçları listesi. */
export const SEARCH_RESULT_SLUGS = ['elektrikli-sup-deneyimi', 'ruzgar-sorfu-baslangic'];

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

/** Harita görünümündeki fiyat balonları (sahte konumlarla). */
export const MAP_PINS = [
  { priceTRY: 600, top: '30%', left: '40%', highlighted: false },
  { priceTRY: 1200, top: '45%', left: '60%', highlighted: true },
  { priceTRY: 450, top: '60%', left: '30%', highlighted: false },
];

export const MAP_IMAGE = {
  src: '/images/map-search-view.png',
  alt: 'Büyükçekmece kıyı şeridini gösteren sade, açık temalı dijital harita görünümü',
};
