import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AgencyNav } from '@/components/AgencyNav';
import { requireAgencyPage } from '@/lib/agency-auth';
import { getActivityBySlug } from '@/lib/db/activities';
import { getSlot } from '@/lib/db/slots';
import { formatPrice } from '@/lib/format';
import { CARD } from '@/components/form';
import { AgencyBookingForm } from './AgencyBookingForm';

export const metadata: Metadata = {
  title: 'Yer Tut',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AgencyBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ slot?: string }>;
}) {
  const session = await requireAgencyPage();

  const { slug } = await params;
  const { slot: slotId } = await searchParams;

  const activity = await getActivityBySlug(slug);
  if (!activity || activity.status !== 'published') notFound();

  const slot = slotId ? await getSlot(slotId) : null;
  // Slot kimliği adresten geliyor; gerçekten BU aktiviteye ait olduğu
  // doğrulanıyor. Doğrulanmasaydı yanlış aktivitenin fiyatı ve süresi
  // gösterilir, rezervasyon başka bir yere düşerdi.
  if (!slot || slot.activityId !== activity.id) notFound();

  return (
    <div className="min-h-screen">
      <AgencyNav session={session} />

      <main className="mx-auto flex max-w-[36rem] flex-col gap-lg px-container-margin py-lg">
        <div>
          <Link href="/acente/ara" className="text-label-bold text-on-surface-variant">
            ← Müsaitlik
          </Link>
          <h1 className="mt-xs text-headline-md text-on-background">{activity.title}</h1>
          <p className="text-body-md text-on-surface-variant">
            {slot.date} · {slot.time} · {activity.location} · {activity.durationLabel}
          </p>
          <p className="mt-xs text-title-price text-on-surface">
            {formatPrice(activity.priceTRY)} / kişi · tesiste ödenir
          </p>
        </div>

        {slot.remaining <= 0 ? (
          <div className={`${CARD} text-center`}>
            <p className="text-headline-sm text-on-surface">Bu saat az önce doldu</p>
            <Link href="/acente/ara" className="mt-sm inline-block text-label-bold underline">
              Başka bir saat seçin
            </Link>
          </div>
        ) : (
          <section className={CARD}>
            <AgencyBookingForm slotId={slot.id} maxPeople={slot.remaining} />
          </section>
        )}
      </main>
    </div>
  );
}
