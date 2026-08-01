import Image from 'next/image';
import Link from 'next/link';
import { Icon } from './Icon';
import { formatPrice } from '@/lib/format';
import type { Activity } from '@/lib/data';

/**
 * Arama sonuçları listesindeki kart. Ana sayfa kartından farkı: konum ve süre
 * ayrı satırlarda, üstte "Hemen Onay" ya da doluluk uyarısı rozeti.
 */
export function SearchResultCard({ activity }: { activity: Activity }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card">
      <div className="relative h-48 w-full">
        <Image
          src={activity.image}
          alt={activity.imageAlt}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
        />

        {activity.spotsLeft !== undefined ? (
          <div className="absolute top-sm left-sm flex items-center gap-1 rounded bg-error-container px-2 py-1 text-label-sm font-semibold text-on-error-container shadow-sm">
            Sadece {activity.spotsLeft} Kaldı
          </div>
        ) : (
          activity.instantConfirm && (
            <div className="absolute top-sm left-sm flex items-center gap-1 rounded bg-surface-container-lowest px-2 py-1 text-label-sm font-semibold text-primary shadow-sm">
              <Icon name="bolt" filled size={14} />
              Hemen Onay
            </div>
          )
        )}

        <button
          type="button"
          aria-label="Favorilere ekle"
          className="absolute top-sm right-sm flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-lowest/80 text-on-surface-variant backdrop-blur-sm transition-transform active:scale-90"
        >
          <Icon name="favorite" size={20} />
        </button>
      </div>

      <div className="flex flex-col gap-sm p-md">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-headline-sm text-on-surface">{activity.title}</h3>
          <div className="flex shrink-0 items-center gap-1 text-on-surface-variant">
            <Icon name="star" filled size={16} className="text-tertiary-container" />
            <span className="text-label-sm font-semibold">
              {activity.rating} <span className="text-body-md text-outline">({activity.reviewCount})</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-xs text-body-md text-on-surface-variant">
          <Icon name="location_on" size={16} />
          {activity.location}
        </div>
        <div className="flex items-center gap-xs text-body-md text-on-surface-variant">
          <Icon name="schedule" size={16} />
          {activity.durationLabel}
        </div>

        <div className="mt-sm flex items-end justify-between border-t border-surface-variant pt-sm">
          <div className="flex flex-col">
            <span className="text-label-sm text-outline">Kişi başı</span>
            <span className="text-title-price text-on-surface">
              {formatPrice(activity.priceTRY)}
            </span>
          </div>
          <Link
            href={`/aktivite/${activity.slug}`}
            className="rounded-lg bg-primary px-4 py-2 text-label-bold text-on-primary transition-transform active:scale-95"
          >
            İncele
          </Link>
        </div>
      </div>
    </article>
  );
}
