import Image from 'next/image';
import Link from 'next/link';
import { Icon } from './Icon';
import { formatPrice } from '@/lib/format';
import type { Activity } from '@/lib/catalog';

/**
 * Ana sayfadaki "popüler deneyimler" kartı: üstte geniş görsel, köşede puan
 * rozeti, altta fiyat ve "İncele" aksiyonu.
 */
export function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <article className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card">
      <div className="relative h-48 w-full">
        <Image
          src={activity.image}
          alt={activity.imageAlt}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
        />
        <div className="absolute top-3 left-3 flex items-center gap-1 rounded bg-surface-container-lowest px-2 py-1 text-label-bold text-primary">
          <Icon name="star" filled size={14} />
          {activity.rating} ({activity.reviewCount})
        </div>
      </div>

      <div className="p-4">
        {/* Favori düğmesi kaldırıldı: arkasında kalıcılık yok, tıklama hiçbir
            şey yapmıyordu. Aynı gerekçe DetailHeader'da yazılı. */}
        <div className="mb-2">
          <h3 className="text-headline-sm text-on-surface">{activity.title}</h3>
        </div>

        <p className="mb-4 flex items-center gap-2 text-body-md text-on-surface-variant">
          <Icon name="schedule" size={14} />
          {activity.durationLabel} • {activity.location}
        </p>

        <div className="flex items-end justify-between">
          <div>
            <span className="block text-label-sm text-on-surface-variant">Kişi başı</span>
            <span className="text-title-price text-on-surface">
              {formatPrice(activity.priceTRY)}
            </span>
          </div>
          <Link
            href={`/aktivite/${activity.slug}`}
            className="rounded-lg bg-primary-container px-4 py-2 text-label-bold text-on-primary-container transition-transform active:scale-95"
          >
            İncele
          </Link>
        </div>
      </div>
    </article>
  );
}
