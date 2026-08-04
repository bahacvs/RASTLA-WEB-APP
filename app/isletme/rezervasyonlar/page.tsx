import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OperatorNav } from '@/components/OperatorNav';
import { Icon } from '@/components/Icon';
import { getOperatorId } from '@/lib/session';
import { getOperator } from '@/lib/operators';
import { listBookingsForOperator } from '@/lib/db/bookings';
import { getUser } from '@/lib/db/users';
import { getActivityBySlug } from '@/lib/db/activities';
import { formatPrice } from '@/lib/format';
import { CancelBookingButton, CancelDayButton } from './CancelControls';

export const metadata: Metadata = {
  title: 'Rezervasyonlar',
  robots: { index: false, follow: false },
};

const STATUS = {
  confirmed: { label: 'Bekliyor', className: 'bg-secondary-container text-on-secondary-container' },
  redeemed: { label: 'Kullanıldı', className: 'bg-surface-container-high text-on-surface-variant' },
  cancelled: { label: 'İptal', className: 'bg-error-container text-on-error-container' },
};

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export default async function OperatorBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gun?: string }>;
}) {
  const operatorId = await getOperatorId();
  if (!operatorId) redirect('/isletme');

  const operator = getOperator(operatorId);
  if (!operator) redirect('/isletme');

  const { gun } = await searchParams;
  const day = gun && /^\d{4}-\d{2}-\d{2}$/.test(gun) ? gun : isoDate(new Date());

  const bookings = listBookingsForOperator(operatorId, day);
  const guests = bookings
    .filter((b) => b.status !== 'cancelled')
    .reduce((sum, b) => sum + b.adults + b.children, 0);
  const revenue = bookings
    .filter((b) => b.status !== 'cancelled')
    .reduce((sum, b) => sum + b.totalTRY, 0);

  const activeCount = bookings.filter((b) => b.status === 'confirmed').length;

  return (
    <div className="min-h-screen">
      <OperatorNav operatorName={operator.name} />

      <main className="mx-auto max-w-[48rem] px-container-margin py-lg">
        <div className="mb-lg flex flex-wrap items-center justify-between gap-sm">
          <h1 className="text-headline-md text-on-background">Rezervasyonlar</h1>
          <form className="flex items-center gap-2">
            <input
              name="gun"
              type="date"
              defaultValue={day}
              className="h-10 rounded-lg border border-outline-variant bg-surface px-2 text-body-md"
            />
            <button
              type="submit"
              className="rounded-lg border border-outline-variant px-3 py-2 text-label-bold text-on-surface-variant"
            >
              Göster
            </button>
          </form>
        </div>

        <div className="mb-lg grid grid-cols-3 gap-sm">
          <Stat label="Rezervasyon" value={String(bookings.length)} />
          <Stat label="Misafir" value={String(guests)} />
          <Stat label="Ciro" value={formatPrice(revenue)} />
        </div>

        {activeCount > 0 && (
          <div className="mb-lg">
            <CancelDayButton date={day} count={activeCount} />
          </div>
        )}

        {bookings.length === 0 ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg text-center shadow-card">
            <Icon name="calendar_today" size={40} className="mb-sm text-outline" />
            <p className="text-headline-sm text-on-surface">Bu gün için rezervasyon yok</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-sm">
            {bookings.map((booking) => {
              const activity = getActivityBySlug(booking.activitySlug);
              const user = getUser(booking.userId);
              const status = STATUS[booking.status];

              return (
                <li
                  key={booking.id}
                  className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
                >
                  <div className="mb-xs flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-lg font-semibold text-on-surface">
                        {booking.bookingTime} · {activity?.title}
                      </p>
                      <p className="text-body-md text-on-surface-variant">
                        {user?.name ?? '—'} · {user?.phone ?? '—'}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-label-bold ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="flex items-end justify-between border-t border-surface-variant pt-sm">
                    <span className="text-body-md text-on-surface-variant">
                      {booking.adults} yetişkin
                      {booking.children > 0 ? `, ${booking.children} çocuk` : ''}
                    </span>
                    <div className="text-right">
                      <span className="block font-mono text-label-sm text-outline">
                        {booking.code}
                      </span>
                      <span className="text-title-price text-on-surface">
                        {formatPrice(booking.totalTRY)}
                      </span>
                    </div>
                  </div>

                  {booking.status === 'confirmed' && (
                    <div className="mt-sm flex justify-end">
                      <CancelBookingButton code={booking.code} />
                    </div>
                  )}

                  {booking.cancelReason === 'weather' && (
                    <p className="mt-sm text-label-sm text-on-surface-variant">
                      Hava koşulu nedeniyle iptal edildi
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md text-center shadow-card">
      <p className="text-label-sm text-on-surface-variant">{label}</p>
      <p className="text-headline-sm text-on-surface">{value}</p>
    </div>
  );
}
