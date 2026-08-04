import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookingView } from './BookingView';
import { getActivityBySlug } from '@/lib/db/activities';
import { datesWithAvailability, listSlots } from '@/lib/db/slots';

// Slotlar ve doluluk sürekli değiştiği için bu sayfa önceden üretilmez.
export const dynamic = 'force-dynamic';

/** Takvimde gösterilecek ufuk. */
const HORIZON_DAYS = 60;

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const activity = await getActivityBySlug(slug);
  return activity ? { title: `${activity.title} — Rezervasyon` } : {};
}

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const activity = await getActivityBySlug(slug);
  if (!activity) notFound();

  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + HORIZON_DAYS);

  // Yalnızca boş yeri olan günler istemciye taşınır; tüm slotları göndermek
  // gereksiz büyük bir yük olurdu (günde 40 slot × 60 gün).
  const availableDates = await datesWithAvailability(activity.id, isoDate(today), isoDate(horizon));

  // İlk müsait gün açılışta seçili gelir; o günün slotları sunucuda hazırlanır.
  const initialDate = availableDates[0] ?? null;
  const initialSlots = initialDate
    ? (await listSlots(activity.id, initialDate)).filter((s) => s.status === 'open')
    : [];

  return (
    <BookingView
      activity={activity}
      availableDates={availableDates}
      initialDate={initialDate}
      initialSlots={initialSlots}
    />
  );
}
