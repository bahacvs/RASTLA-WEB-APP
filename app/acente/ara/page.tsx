import type { Metadata } from 'next';
import Link from 'next/link';
import { AgencyNav } from '@/components/AgencyNav';
import { requireAgencyPage } from '@/lib/agency-auth';
import { listPublishedActivities } from '@/lib/db/activities';
import { listSlots } from '@/lib/db/slots';
import { formatPrice } from '@/lib/format';
import { CARD } from '@/components/form';

export const metadata: Metadata = {
  title: 'Müsaitlik',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Acentenin müsaitlik ekranı.
 *
 * Resepsiyon görevlisinin sorduğu tek soru şu: "misafirim yarın saat üçte
 * jet ski yapabilir mi?" Ekran buna göre kurulu — gün seçilir, o günün yeri
 * kalan seansları listelenir.
 *
 * Gösterilen doluluk **canlı**: aynı slot tablosundan okunuyor, ayrı bir
 * kopya tutulmuyor. Acenteye ayrı bir kontenjan ayrılsaydı iki sayaç olur ve
 * ikisinin arası er geç açılırdı.
 */
export default async function AgencySearchPage({
  searchParams,
}: {
  searchParams: Promise<{ gun?: string }>;
}) {
  const session = await requireAgencyPage();

  const { gun } = await searchParams;
  const day = gun && /^\d{4}-\d{2}-\d{2}$/.test(gun) ? gun : isoDate(new Date());

  const activities = await listPublishedActivities();

  const rows = [];
  for (const activity of activities) {
    const slots = (await listSlots(activity.id, day)).filter(
      (slot) => slot.status === 'open' && slot.remaining > 0
    );
    if (slots.length > 0) rows.push({ activity, slots });
  }

  return (
    <div className="min-h-screen">
      <AgencyNav session={session} />

      <main className="mx-auto flex max-w-[52rem] flex-col gap-lg px-container-margin py-lg">
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <h1 className="text-headline-md text-on-background">Müsaitlik</h1>
          <form className="flex items-center gap-2">
            <label htmlFor="gun" className="sr-only">
              Gün
            </label>
            <input
              id="gun"
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

        {/*
          Ticari çerçeve baştan yazılı. Acente komisyon almıyor ve ücret
          tesiste tahsil ediliyor; bunu söylememek, resepsiyon görevlisinin
          misafire yanlış bir şey söylemesine yol açardı.
        */}
        <p className="rounded-xl border border-outline-variant bg-surface-container p-md text-body-md text-on-surface-variant">
          Tuttuğunuz yer <strong className="text-on-surface">anında kesinleşir</strong> ve
          işletmenin takviminden düşer. <strong className="text-on-surface">Ücret tesiste</strong>{' '}
          tahsil edilir; bu ekrandan tahsilat yapılmaz.
        </p>

        {rows.length === 0 ? (
          <div className={`${CARD} text-center`}>
            <p className="text-headline-sm text-on-surface">Bu gün için yer kalmamış</p>
            <p className="text-body-md text-on-surface-variant">Başka bir gün deneyin.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-md">
            {rows.map(({ activity, slots }) => (
              <li key={activity.id} className={CARD}>
                <div className="mb-sm flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-body-lg font-semibold text-on-surface">{activity.title}</p>
                    <p className="text-body-md text-on-surface-variant">
                      {activity.location} · {activity.durationLabel}
                    </p>
                  </div>
                  <span className="text-title-price text-on-surface">
                    {formatPrice(activity.priceTRY)} / kişi
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {slots.map((slot) => (
                    <Link
                      key={slot.id}
                      href={`/acente/rezervasyon/${activity.slug}?slot=${slot.id}`}
                      className="rounded-full border border-outline-variant px-3 py-2 text-label-bold text-on-surface-variant hover:bg-surface-container-low"
                    >
                      {slot.time} · {slot.remaining} yer
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
