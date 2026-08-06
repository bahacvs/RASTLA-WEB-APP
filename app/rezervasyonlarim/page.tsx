import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { BottomNavBar } from '@/components/BottomNavBar';
import { listBookingsForUser, type BookingStatus } from '@/lib/db/bookings';
import { currentUserId } from '@/lib/auth';
import { getActivityBySlug } from '@/lib/db/activities';
import { formatPrice } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Rezervasyonlarım',
  robots: { index: false, follow: false },
};

const STATUS: Record<BookingStatus, { label: string; className: string }> = {
  // Ödeme yarıda kalmışsa bilet GEÇERLİ DEĞİL; listede de öyle görünmeli.
  pending_payment: {
    label: 'Ödeme bekliyor',
    className: 'bg-tertiary-container text-on-tertiary-container',
  },
  confirmed: { label: 'Geçerli', className: 'bg-secondary-container text-on-secondary-container' },
  redeemed: { label: 'Kullanıldı', className: 'bg-surface-container-high text-on-surface-variant' },
  cancelled: { label: 'İptal', className: 'bg-error-container text-on-error-container' },
  expired: { label: 'Süresi doldu', className: 'bg-surface-container-high text-on-surface-variant' },
};

export default async function MyBookingsPage() {
  const userId = await currentUserId();
  const bookings = userId ? await listBookingsForUser(userId) : [];

  // Aktiviteler JSX'ten ÖNCE toplanır: render sırasında veri çekilemez.
  const activities = new Map(
    await Promise.all(
      [...new Set(bookings.map((b) => b.activitySlug))].map(
        async (slug) => [slug, await getActivityBySlug(slug)] as const
      )
    )
  );

  return (
    <div className="min-h-screen pb-24">
      <header className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between border-b border-surface-variant bg-surface px-container-margin">
        <h1 className="text-headline-sm text-primary">Rezervasyonlarım</h1>
        {userId && (
          <Link
            href="/hesabim"
            className="flex items-center gap-1 text-label-bold text-on-surface-variant hover:underline"
          >
            <Icon name="person" size={18} />
            Hesabım
          </Link>
        )}
      </header>

      <main className="mx-auto max-w-[32rem] px-container-margin py-lg">
        {bookings.length === 0 ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg text-center shadow-card">
            <Icon name="calendar_today" size={40} className="mb-sm text-outline" />
            <p className="mb-sm text-headline-sm text-on-surface">Henüz rezervasyonun yok</p>
            <p className="mb-md text-body-md text-on-surface-variant">
              Rezervasyon yaptığında biletlerin burada görünür.
            </p>
            <Link
              href="/ara"
              className="inline-block rounded-lg bg-primary px-4 py-2 text-label-bold text-on-primary transition-transform active:scale-95"
            >
              Deneyimleri Keşfet
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-md">
            {bookings.map((booking) => {
              const activity = activities.get(booking.activitySlug);
              const status = STATUS[booking.status];

              return (
                <li key={booking.id}>
                  <Link
                    href={`/bilet/${booking.code}`}
                    className="block rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card transition-transform active:scale-[0.99]"
                  >
                    <div className="mb-sm flex items-start justify-between gap-3">
                      <h2 className="text-headline-sm text-on-surface">{activity?.title}</h2>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-label-bold ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-xs text-body-md text-on-surface-variant">
                      <Icon name="calendar_today" size={16} />
                      {booking.bookingDate} · {booking.bookingTime}
                    </div>

                    <div className="mt-sm flex items-end justify-between border-t border-surface-variant pt-sm">
                      <span className="font-mono text-label-sm text-outline">{booking.code}</span>
                      <span className="text-title-price text-on-surface">
                        {formatPrice(booking.totalTRY)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <BottomNavBar />
    </div>
  );
}
