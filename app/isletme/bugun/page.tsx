import type { Metadata } from 'next';
import { OperatorNav } from '@/components/OperatorNav';
import { requireOperatorPage, can } from '@/lib/auth';
import { listBookingsForOperator, SOURCE_LABELS, PAYMENT_MODE_LABELS } from '@/lib/db/bookings';
import { listActivitiesForOperator } from '@/lib/db/activities';
import { listSlots } from '@/lib/db/slots';
import { displayContact, getUser } from '@/lib/db/users';
import { formatPrice } from '@/lib/format';
import { forecastsForOperator } from '@/lib/db/weather.mjs';
import { WeatherStrip } from '@/components/WeatherStrip';
import { ManualBookingForm } from './ManualBookingForm';
import { BookingRowActions } from './BookingRowActions';

export const metadata: Metadata = {
  title: 'Bugün',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Panelin ana ekranı.
 *
 * İşletmenin paneli açtığında sorduğu ilk soru "bugün ne var?" — grafik
 * panosu değil. Bu yüzden üstte günün sayıları, altında saat sırasına dizilmiş
 * operasyon akışı var; her satırda o an gereken işlemler elin altında.
 */
export default async function TodayPage() {
  const session = await requireOperatorPage('bugun.goruntule');
  const today = isoDate(new Date());

  const bookings = await listBookingsForOperator(session.operator.id, today);
  const activities = await listActivitiesForOperator(session.operator.id);
  const bySlug = new Map(activities.map((a) => [a.slug, a]));

  // İptal ve süresi dolmuş kayıtlar günün akışında yer tutmamalı; onları
  // görmek gerektiğinde Rezervasyonlar ekranı var.
  const live = bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'expired');

  const participants = live.reduce((sum, b) => sum + b.adults + b.children, 0);

  // Beklenen tahsilat = tesiste ödenecekler. Online ödenenler zaten tahsil
  // edildi; ikisini toplamak işletmeye bugün eline geçecek parayı yanlış
  // gösterirdi.
  const expected = live
    .filter((b) => b.paymentMode !== 'online')
    .reduce((sum, b) => sum + b.totalTRY, 0);

  const awaitingPayment = bookings.filter((b) => b.status === 'pending_payment').length;

  // Bugünün boş kapasitesi: açık slotlardaki kalan yer.
  let freeCapacity = 0;
  for (const activity of activities) {
    const slots = await listSlots(activity.id, today);
    freeCapacity += slots
      .filter((s) => s.status === 'open')
      .reduce((sum, s) => sum + s.remaining, 0);
  }

  const contacts = new Map<string, { name: string; phone: string }>();
  for (const booking of live) {
    if (contacts.has(booking.userId)) continue;
    contacts.set(booking.userId, displayContact(await getUser(booking.userId)));
  }

  const mayAddManual = can(session, 'rezervasyon.manuel');

  // Hava şeridi yalnızca söyleyecek bir şey varsa çizilir: `uygun` günler ve
  // tahmini olmayan aktiviteler elenir. Her sabah "hava uygun" yazan bir kutu
  // bir süre sonra hiç okunmaz ve gerçekten uyardığı gün de okunmazdı.
  const forecasts = await forecastsForOperator(session.operator.id, today);
  const warnings = activities
    .map((a) => ({ activity: a, forecast: forecasts.get(a.id) ?? null }))
    .filter((row) => row.forecast !== null && row.forecast.verdict !== 'uygun');

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />

      <main className="mx-auto flex max-w-[60rem] flex-col gap-lg px-container-margin py-lg">
        <div>
          <h1 className="text-headline-md text-on-background">Bugün</h1>
          <p className="text-body-md text-on-surface-variant">
            {new Date().toLocaleDateString('tr-TR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>

        {/* Günün sayıları */}
        <section className="grid grid-cols-2 gap-sm sm:grid-cols-3 lg:grid-cols-5">
          <Tile label="Rezervasyon" value={String(live.length)} />
          <Tile label="Katılımcı" value={String(participants)} />
          <Tile label="Beklenen tahsilat" value={formatPrice(expected)} />
          <Tile label="Boş kapasite" value={String(freeCapacity)} />
          <Tile
            label="Ödeme bekleyen"
            value={String(awaitingPayment)}
            tone={awaitingPayment > 0 ? 'warn' : undefined}
          />
        </section>

        {warnings.length > 0 && (
          <section className="flex flex-col gap-sm">
            {warnings.map(({ activity, forecast }) => (
              <WeatherStrip key={activity.id} forecast={forecast} activityTitle={activity.title} />
            ))}
          </section>
        )}

        {/* Operasyon akışı */}
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
          <h2 className="mb-md text-headline-sm text-on-surface">Günün akışı</h2>

          {live.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">
              Bugün için rezervasyon yok.
            </p>
          ) : (
            <ul className="flex flex-col gap-sm">
              {live.map((booking) => {
                const activity = bySlug.get(booking.activitySlug);
                const contact = contacts.get(booking.userId) ?? { name: '—', phone: '' };
                const people = booking.adults + booking.children;

                return (
                  <li
                    key={booking.id}
                    className="rounded-lg border border-outline-variant p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-body-md font-semibold text-on-surface">
                          <span className="text-title-price">{booking.bookingTime}</span>{' '}
                          · {activity?.title ?? booking.activitySlug}
                        </p>
                        <p className="text-body-md text-on-surface-variant">
                          {contact.name} · {people} kişi ·{' '}
                          {PAYMENT_MODE_LABELS[booking.paymentMode]}
                          {booking.source !== 'rastla' && ` · ${SOURCE_LABELS[booking.source]}`}
                        </p>
                      </div>

                      <StatusBadge booking={booking} />
                    </div>

                    <BookingRowActions
                      code={booking.code}
                      phone={contact.phone}
                      people={people}
                      status={booking.status}
                      attended={booking.attended}
                      noShow={booking.noShowAt !== null}
                      canCheckIn={can(session, 'checkin.yap')}
                      canManage={can(session, 'rezervasyon.yonet')}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/*
          Manuel kayıt yalnızca yetkisi olana gösteriliyor. Saha personeli
          rezervasyon açamaz: fiyat ve kapasite kararı onun işi değil.
        */}
        {mayAddManual && activities.length > 0 && (
          <ManualBookingForm
            activities={activities.map((a) => ({ id: a.id, title: a.title }))}
            today={today}
          />
        )}
      </main>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        tone === 'warn'
          ? 'border-error-container bg-error-container text-on-error-container'
          : 'border-outline-variant bg-surface-container-lowest text-on-surface'
      }`}
    >
      <p className="text-label-sm opacity-80">{label}</p>
      <p className="text-headline-sm font-semibold">{value}</p>
    </div>
  );
}

function StatusBadge({
  booking,
}: {
  booking: { status: string; attended: number | null; noShowAt: string | null };
}) {
  const [label, className] = booking.noShowAt
    ? ['Gelmedi', 'bg-error-container text-on-error-container']
    : booking.status === 'redeemed'
      ? [`Geldi${booking.attended !== null ? ` (${booking.attended})` : ''}`, 'bg-primary text-on-primary']
      : booking.status === 'pending_payment'
        ? ['Ödeme bekliyor', 'bg-tertiary-container text-on-tertiary-container']
        : ['Bekleniyor', 'bg-secondary-container text-on-secondary-container'];

  return (
    <span className={`shrink-0 rounded-full px-2 py-1 text-label-bold ${className}`}>
      {label}
    </span>
  );
}
