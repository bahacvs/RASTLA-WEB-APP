import type { Metadata } from 'next';
import { AgencyNav } from '@/components/AgencyNav';
import { requireAgencyPage } from '@/lib/agency-auth';
import { listBookingsForAgency } from '@/lib/db/bookings';
import { getActivityBySlug } from '@/lib/db/activities';
import { displayContact, getUser } from '@/lib/db/users';
import { formatPrice } from '@/lib/format';
import { CARD } from '@/components/form';
import { CancelAgencyBookingButton } from './CancelControl';

export const metadata: Metadata = {
  title: 'Rezervasyonlarım',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Geçerli', className: 'bg-secondary-container text-on-secondary-container' },
  redeemed: { label: 'Kullanıldı', className: 'bg-surface-container-high text-on-surface-variant' },
  cancelled: { label: 'İptal', className: 'bg-error-container text-on-error-container' },
  pending_payment: {
    label: 'Ödeme bekliyor',
    className: 'bg-tertiary-container text-on-tertiary-container',
  },
  expired: { label: 'Düştü', className: 'bg-surface-container-high text-on-surface-variant' },
};

/**
 * Acentenin kendi açtığı rezervasyonlar.
 *
 * Süzgeç `agency_id` üzerinde ve kimlik OTURUMDAN geliyor: başka bir acentenin
 * kayıtlarını görmenin bir yolu yok — adres çubuğuna yazılacak bir kimlik
 * parametresi hiç tanımlanmadı.
 */
export default async function AgencyBookingsPage() {
  const session = await requireAgencyPage();

  const bookings = await listBookingsForAgency(session.agency.id);

  const activities = new Map(
    await Promise.all(
      [...new Set(bookings.map((b) => b.activitySlug))].map(
        async (slug) => [slug, await getActivityBySlug(slug)] as const
      )
    )
  );
  const guests = new Map(
    await Promise.all(
      [...new Set(bookings.map((b) => b.userId))].map(
        async (id) => [id, displayContact(await getUser(id))] as const
      )
    )
  );

  return (
    <div className="min-h-screen">
      <AgencyNav session={session} />

      <main className="mx-auto flex max-w-[48rem] flex-col gap-lg px-container-margin py-lg">
        <h1 className="text-headline-md text-on-background">Rezervasyonlarım</h1>

        {bookings.length === 0 ? (
          <div className={`${CARD} text-center`}>
            <p className="text-headline-sm text-on-surface">Henüz rezervasyon yok</p>
            <p className="text-body-md text-on-surface-variant">
              Müsaitlik ekranından misafiriniz adına yer tutabilirsiniz.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-sm">
            {bookings.map((booking) => {
              const activity = activities.get(booking.activitySlug);
              const guest = guests.get(booking.userId) ?? displayContact(null);
              const status = STATUS[booking.status] ?? {
                label: booking.status,
                className: 'bg-surface-container-high text-on-surface-variant',
              };

              return (
                <li key={booking.id} className={CARD}>
                  <div className="mb-xs flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-lg font-semibold text-on-surface">
                        {booking.bookingDate} {booking.bookingTime} ·{' '}
                        {activity?.title ?? booking.activitySlug}
                      </p>
                      <p className="text-body-md text-on-surface-variant">
                        {guest.name} · {guest.phone}
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
                      {booking.adults + booking.children} kişi · tesiste ödenir
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
                      <CancelAgencyBookingButton code={booking.code} />
                    </div>
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
