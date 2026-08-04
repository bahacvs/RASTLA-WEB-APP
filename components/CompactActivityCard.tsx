import Image from 'next/image';
import Link from 'next/link';
import { Icon } from './Icon';
import { formatPrice } from '@/lib/format';
import type { Activity } from '@/lib/catalog';

/**
 * Ana sayfadaki "Bugün Müsait" yatay şeridinde kullanılan dar kart:
 * solda kare görsel, sağda başlık, onay rozeti ve fiyat.
 */
export function CompactActivityCard({ activity }: { activity: Activity }) {
  return (
    <Link
      href={`/aktivite/${activity.slug}`}
      className="min-w-[240px] rounded-xl border border-outline-variant bg-surface-container-lowest p-3 shadow-sm"
    >
      <div className="flex gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
          <Image
            src={activity.image}
            alt={activity.imageAlt}
            fill
            sizes="80px"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col justify-between">
          <h3 className="line-clamp-2 text-sm font-semibold text-on-surface">{activity.title}</h3>
          {activity.instantConfirm && (
            <div className="flex items-center gap-1 text-tertiary">
              <Icon name="flash_on" size={14} />
              <span className="text-xs text-label-bold">Hemen Onay</span>
            </div>
          )}
          <span className="text-lg font-bold text-on-surface">
            {formatPrice(activity.priceTRY)}
          </span>
        </div>
      </div>
    </Link>
  );
}
