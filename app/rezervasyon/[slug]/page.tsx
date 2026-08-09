import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookingView } from './BookingView';
import { getActivityBySlug } from '@/lib/db/activities';
import { datesWithAvailability, listSlots } from '@/lib/db/slots';
import { onlinePaymentFor } from '@/lib/payments/flow';
import { loadPricing } from '@/lib/db/pricing';

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

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { slug } = await params;
  // Paylaşım linkinin kodu. Yalnızca forma taşınıyor; kaynak etiketi sunucu
  // eyleminde veritabanından yeniden çözülüyor (bkz. lib/db/booking-links.ts).
  const { k: linkCode } = await searchParams;
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

  // Ödemenin online alınıp alınmayacağı SUNUCUDA belirlenir ve istemciye
  // yalnızca bir evet/hayır olarak taşınır. Bu bilgi sadece butonun metnini ve
  // alt notu değiştiriyor; kararın kendisi sunucu eyleminde yeniden veriliyor.
  const payment = await onlinePaymentFor(activity.operatorId);

  // Fiyat kuralları istemciye taşınıyor ki müşteri saat seçtiğinde tutarı
  // anında görsün. Taşınan şey bir GÖSTERİM; rezervasyon eylemi aynı kuralları
  // veritabanından yeniden okuyup tutarı baştan hesaplıyor.
  const pricing = await loadPricing(activity.id);

  return (
    <BookingView
      activity={activity}
      availableDates={availableDates}
      initialDate={initialDate}
      initialSlots={initialSlots}
      payOnline={payment.available && activity.priceTRY > 0}
      linkCode={linkCode ?? null}
      priceRules={pricing.rules}
      groupDiscounts={pricing.discounts}
    />
  );
}
