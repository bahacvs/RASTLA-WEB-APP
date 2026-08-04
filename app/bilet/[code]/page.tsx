import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { TicketQr } from '@/components/TicketQr';
import { CancelButton } from './CancelButton';
import { getBookingByCode } from '@/lib/db/bookings';
import { getUser } from '@/lib/db/users';
import { getActivityBySlug } from '@/lib/db/activities';
import { getOperator } from '@/lib/db/operators';
import { formatPrice } from '@/lib/format';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Biletiniz',
  // Bilet bağlantısı kodu taşır; arama motorlarında görünmemeli.
  robots: { index: false, follow: false },
};

const STATUS_STYLES = {
  confirmed: {
    label: 'Geçerli bilet',
    className: 'bg-secondary-container text-on-secondary-container',
    icon: 'check_circle' as const,
  },
  redeemed: {
    label: 'Kullanıldı',
    className: 'bg-surface-container-high text-on-surface-variant',
    icon: 'check_circle' as const,
  },
  cancelled: {
    label: 'İptal edildi',
    className: 'bg-error-container text-on-error-container',
    icon: 'close' as const,
  },
};

export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const booking = await getBookingByCode(decodeURIComponent(code));
  if (!booking) notFound();

  const activity = await getActivityBySlug(booking.activitySlug);
  const operator = await getOperator(booking.operatorId);
  const user = await getUser(booking.userId);
  const status = STATUS_STYLES[booking.status];

  return (
    <div className="min-h-screen px-container-margin py-lg">
      <div className="mx-auto max-w-[28rem]">
        <Link
          href="/rezervasyonlarim"
          className="mb-lg inline-flex items-center gap-2 text-label-bold text-on-surface-variant"
        >
          <Icon name="arrow_back" size={18} />
          Rezervasyonlarım
        </Link>

        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card">
          <div className="border-b border-dashed border-outline-variant p-lg text-center">
            <div
              className={`mb-md inline-flex items-center gap-1 rounded-full px-3 py-1 text-label-bold ${status.className}`}
            >
              <Icon name={status.icon} filled size={16} />
              {status.label}
            </div>

            <h1 className="mb-xs text-headline-sm text-on-surface">{activity?.title}</h1>
            {operator && <p className="text-body-md text-on-surface-variant">{operator.name}</p>}
          </div>

          <div className="flex flex-col items-center p-lg">
            {booking.status === 'confirmed' ? (
              <>
                <div className="rounded-xl border border-outline-variant bg-white p-4">
                  <TicketQr value={`${SITE_URL}/bilet/${booking.code}`} />
                </div>
                <p className="mt-md text-center text-body-md text-on-surface-variant">
                  İşletmeye bu kodu okutun
                </p>
              </>
            ) : (
              <div className="flex h-[220px] w-[220px] flex-col items-center justify-center rounded-xl border border-outline-variant bg-surface-container">
                <Icon name="close" size={48} className="mb-sm text-outline" />
                <p className="px-4 text-center text-body-md text-on-surface-variant">
                  {booking.status === 'redeemed'
                    ? 'Bu bilet kullanıldı'
                    : 'Bu bilet iptal edildi'}
                </p>
              </div>
            )}

            <p className="mt-md font-mono text-headline-sm tracking-wider text-on-surface">
              {booking.code}
            </p>
          </div>

          <dl className="border-t border-dashed border-outline-variant p-lg">
            <Row label="Ad Soyad" value={user?.name ?? '—'} />
            <Row label="Tarih" value={booking.bookingDate} />
            <Row label="Saat" value={booking.bookingTime} />
            <Row
              label="Katılımcı"
              value={`${booking.adults} yetişkin${booking.children > 0 ? `, ${booking.children} çocuk` : ''}`}
            />
            <Row label="Tutar" value={formatPrice(booking.totalTRY)} />
            {booking.redeemedAt && (
              <Row
                label="Kullanım"
                value={new Date(booking.redeemedAt).toLocaleString('tr-TR')}
              />
            )}
            {booking.cancelledAt && (
              <Row
                label="İptal"
                value={`${new Date(booking.cancelledAt).toLocaleString('tr-TR')}${
                  booking.cancelReason === 'weather' ? ' (hava koşulu)' : ''
                }`}
              />
            )}
          </dl>

          {booking.status === 'confirmed' && (
            <div className="border-t border-dashed border-outline-variant p-lg">
              <CancelButton code={booking.code} />
            </div>
          )}
        </div>

        <p className="mt-lg text-center text-label-sm text-on-surface-variant">
          Bu bilet tek kullanımlıktır ve yalnızca bir kez onaylanabilir. Ödeme deneyim yerinde
          alınır.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-outline-variant/40 py-2 last:border-0">
      <dt className="text-body-md text-on-surface-variant">{label}</dt>
      <dd className="text-body-md font-semibold text-on-surface">{value}</dd>
    </div>
  );
}
