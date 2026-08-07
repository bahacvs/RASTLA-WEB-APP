import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { DetailHeader } from './DetailHeader';
import { Gallery } from './Gallery';
import { getActivityBySlug, listPublishedActivities } from '@/lib/db/activities';
import type { Activity } from '@/lib/catalog';
import { formatPrice } from '@/lib/format';
import { directionsUrl } from '@/lib/map';
import { SITE_URL } from '@/lib/site';
import { getOperator } from '@/lib/db/operators';

export async function generateStaticParams() {
  const activities = await listPublishedActivities();
  return activities.map((a) => ({ slug: a.slug }));
}

// Aktiviteler artık veritabanından geliyor; sayfalar önceden üretilir ama
// işletme bir düzenleme yaptığında bir dakika içinde tazelenir.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const activity = await getActivityBySlug(slug);
  if (!activity) return {};

  const description =
    activity.description ??
    `${activity.location} bölgesinde ${activity.durationLabel} süren ${activity.title}.`;

  return {
    title: activity.title,
    description,
    alternates: { canonical: `/aktivite/${activity.slug}` },
    openGraph: {
      type: 'article',
      title: activity.title,
      description,
      url: `/aktivite/${activity.slug}`,
      images: [{ url: activity.image, alt: activity.imageAlt }],
    },
  };
}

/**
 * Arama motorlarının fiyat, puan ve konumu doğrudan okuyabilmesi için
 * yapılandırılmış veri. Yerel aramada zengin sonuç görünümü sağlar.
 */
async function activityJsonLd(activity: Activity) {
  const operatorName = (await getOperator(activity.operatorId))?.name;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: activity.title,
    description: activity.description,
    // schema.org mutlak URL bekler; göreli yol tarayıcıda çözülse de
    // tarama araçları için yeterli değil.
    image: `${SITE_URL}${activity.image}`,
    url: `${SITE_URL}/aktivite/${activity.slug}`,
    category: activity.category,
    ...(operatorName && { brand: { '@type': 'Organization', name: operatorName } }),
    offers: {
      '@type': 'Offer',
      price: activity.priceTRY,
      priceCurrency: 'TRY',
      availability: 'https://schema.org/InStock',
      areaServed: activity.location,
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: activity.rating,
      reviewCount: activity.reviewCount,
    },
  };
}

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const activity = await getActivityBySlug(slug);
  if (!activity) notFound();

  const gallery = activity.gallery ?? [{ src: activity.image, alt: activity.imageAlt }];
  const operatorName = (await getOperator(activity.operatorId))?.name;

  return (
    <div className="flex min-h-screen flex-col pb-24 md:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(activityJsonLd(activity)) }}
      />
      <DetailHeader />

      {/* max-w-[28rem]: `max-w-md` kullanılamıyor — @theme'deki --spacing-md
          tokenı Tailwind'in --container-md değerini gölgeliyor. */}
      <main className="mx-auto w-full max-w-[28rem] flex-grow md:mt-24 md:grid md:max-w-7xl md:grid-cols-12 md:gap-gutter md:px-container-margin">
        <div className="relative w-full md:col-span-7 lg:col-span-8">
          <Gallery images={gallery} />
        </div>

        <div className="px-container-margin pt-lg md:col-span-5 md:px-0 md:pt-0 lg:col-span-4">
          <div className="md:sticky md:top-24">
            {/* Başlık ve doğrulanmış işletme */}
            <div className="mb-lg">
              {operatorName && (
                <div className="mb-xs flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-low px-2 py-1 text-label-sm text-on-surface-variant">
                    <Icon name="verified" filled size={14} className="text-primary" />
                    {operatorName}
                  </span>
                </div>
              )}

              <h1 className="mb-sm text-headline-md text-on-background">{activity.title}</h1>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-md text-on-surface-variant">
                <div className="flex items-center gap-1">
                  <Icon name="star" filled size={18} className="text-primary" />
                  <span className="font-semibold text-on-surface">{activity.rating}</span>
                  <span className="text-sm text-outline underline">
                    ({activity.reviewCount} Değerlendirme)
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Icon name="location_on" size={18} />
                  {activity.location}
                  {/*
                    Yol tarifi burada, konumun yanında duruyor — çünkü koşulu
                    koordinat olması. Aşağıdaki buluşma noktası fotoğrafının
                    üstünde de bir bağlantı var, ama o blok yalnızca işletme
                    fotoğraf yüklediyse çiziliyor. Yol tarifini oraya bağlamak,
                    yerini tam bildiğimiz bir aktivitede bile tarifi
                    gizlemek olurdu.
                  */}
                  {activity.lat !== null && activity.lng !== null && (
                    <a
                      href={directionsUrl(activity.lat, activity.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 font-semibold text-primary hover:underline"
                    >
                      Yol tarifi
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Hızlı bilgi kutuları */}
            <div className="mb-lg grid grid-cols-2 gap-sm">
              <InfoTile icon="schedule" label="Süre" value={activity.durationLabel} />
              {activity.capacityLabel && (
                <InfoTile icon="group" label="Kapasite" value={activity.capacityLabel} />
              )}
            </div>

            {activity.description && (
              <div className="mb-lg">
                <h2 className="mb-sm text-headline-sm text-on-surface">Açıklama</h2>
                <p className="text-body-md leading-relaxed text-on-surface-variant">
                  {activity.description}
                </p>
              </div>
            )}

            <hr className="my-lg border-outline-variant/30 md:hidden" />

            {/* Dahil olanlar ve güvenlik */}
            <div className="mb-lg space-y-sm">
              {activity.included && (
                <DetailList
                  icon="check_circle"
                  iconClass="text-primary"
                  title="Neler Dahil?"
                  items={activity.included}
                />
              )}
              {activity.safety && (
                <DetailList
                  icon="security"
                  iconClass="text-tertiary"
                  title="Güvenlik Bilgileri"
                  items={activity.safety}
                />
              )}
            </div>

            <hr className="my-lg border-outline-variant/30 md:hidden" />

            {activity.meetingPoint && (
              <div className="mb-lg">
                <h2 className="mb-sm text-headline-sm text-on-surface">Buluşma Noktası</h2>
                <div className="relative h-48 w-full overflow-hidden rounded-xl border border-outline-variant/50">
                  <Image
                    src={activity.meetingPoint.image}
                    alt={activity.meetingPoint.alt}
                    fill
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="object-cover"
                  />
                  {/*
                    Koordinat yoksa bağlantı hiç çizilmiyor.
                    Buraya kadar ölü bir düğme duruyordu: "Yol Tarifi" yazıyor
                    ama tıklayınca hiçbir şey olmuyordu. Çalışmayan bir vaat,
                    olmayan bir özellikten kötüdür — kullanıcı buluşma yerini
                    bulabileceğini sanıp gelmiyor.
                  */}
                  {activity.lat !== null && activity.lng !== null && (
                    <div className="absolute right-2 bottom-2">
                      <a
                        href={directionsUrl(activity.lat, activity.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-primary shadow-sm transition-transform active:scale-95"
                      >
                        Yol Tarifi
                        <Icon name="directions" size={16} />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activity.reviews && activity.reviews.length > 0 && (
              <div className="mb-xl md:mb-0">
                <div className="mb-sm flex items-center justify-between">
                  <h2 className="text-headline-sm text-on-surface">Değerlendirmeler</h2>
                  <button type="button" className="text-label-bold text-primary hover:underline">
                    Tümünü Gör
                  </button>
                </div>

                {activity.reviews.map((review) => (
                  <div
                    key={review.author}
                    className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-md"
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container text-headline-sm text-on-secondary-container">
                        {review.initial}
                      </div>
                      <div>
                        <p className="text-label-bold text-on-surface">{review.author}</p>
                        <p className="text-[10px] text-outline">{review.timeAgo}</p>
                      </div>
                      <div className="ml-auto flex text-primary">
                        {Array.from({ length: review.rating }).map((_, i) => (
                          <Icon key={i} name="star" filled size={14} />
                        ))}
                      </div>
                    </div>
                    <p className="text-body-md text-on-surface-variant">
                      &quot;{review.comment}&quot;
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobil yapışkan rezervasyon çubuğu */}
      <div className="fixed bottom-0 left-0 z-50 w-full border-t border-outline-variant/30 bg-surface px-container-margin py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] md:hidden">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-label-sm text-on-surface-variant">Kişi başı</p>
            <p className="text-title-price text-on-surface">{formatPrice(activity.priceTRY)}</p>
          </div>
          <Link
            href={`/rezervasyon/${activity.slug}`}
            className="rounded-lg bg-primary px-8 py-3 text-label-bold text-on-primary shadow-sm transition-transform active:scale-95"
          >
            Rezervasyon Yap
          </Link>
        </div>
      </div>

      {/* Masaüstü sabit rezervasyon kartı */}
      <div className="fixed right-lg bottom-lg z-50 hidden w-[320px] rounded-xl border border-outline-variant/50 bg-surface p-md shadow-[0_8px_24px_rgba(0,0,0,0.1)] md:block">
        <div className="mb-md flex items-center justify-between">
          <div>
            <p className="text-label-sm text-on-surface-variant">Kişi başı</p>
            <p className="text-title-price text-on-surface">{formatPrice(activity.priceTRY)}</p>
          </div>
          <div className="flex items-center text-primary">
            <Icon name="star" filled size={16} />
            <span className="ml-1 text-label-bold text-on-surface">{activity.rating}</span>
          </div>
        </div>
        <Link
          href={`/rezervasyon/${activity.slug}`}
          className="block w-full rounded-lg bg-primary px-8 py-3 text-center text-label-bold text-on-primary shadow-sm transition-colors hover:bg-primary-container"
        >
          Rezervasyon Yap
        </Link>
      </div>
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: 'schedule' | 'group';
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-sm rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
        <Icon name={icon} />
      </div>
      <div>
        <p className="text-label-sm text-on-surface-variant">{label}</p>
        <p className="text-headline-sm leading-tight text-on-surface">{value}</p>
      </div>
    </div>
  );
}

function DetailList({
  icon,
  iconClass,
  title,
  items,
}: {
  icon: 'check_circle' | 'security';
  iconClass: string;
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-xl border border-outline-variant/50 bg-surface-container-low/50 p-md backdrop-blur-sm">
      <h3 className="mb-xs flex items-center gap-2 text-label-bold text-on-surface">
        <Icon name={icon} size={18} className={iconClass} />
        {title}
      </h3>
      <ul className="ml-6 space-y-1 text-body-md text-on-surface-variant">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}
