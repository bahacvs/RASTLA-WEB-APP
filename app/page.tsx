import Link from 'next/link';
import { HomeTopBar } from '@/components/HomeTopBar';
import { ActivityCard } from '@/components/ActivityCard';
import { CompactActivityCard } from '@/components/CompactActivityCard';
import { Icon } from '@/components/Icon';
import { BottomNavBar } from '@/components/BottomNavBar';
import { CATEGORIES, POPULAR_SLUGS, AVAILABLE_TODAY_SLUGS } from '@/lib/catalog';
import { listPublishedActivities } from '@/lib/db/activities';

// Aktiviteler işletme tarafından düzenlenebildiği için sayfa belirli aralıkla tazelenir.
export const revalidate = 60;

export default function HomePage() {
  const activities = listPublishedActivities();
  const bySlug = (slug: string) => activities.find((a) => a.slug === slug);

  const popular = POPULAR_SLUGS.map(bySlug).filter((a) => a !== undefined);
  const availableToday = AVAILABLE_TODAY_SLUGS.map(bySlug).filter((a) => a !== undefined);

  return (
    <div className="pb-24">
      <HomeTopBar />

      <main className="mx-auto max-w-7xl px-container-margin pt-20">
        {/* Hero + arama kutusu */}
        <section className="mt-xl mb-xl">
          <h1 className="mb-4 text-display-lg text-on-background">
            Yakınındaki deneyimlere rastla.
          </h1>
          <p className="mb-6 text-body-lg text-on-surface-variant">
            Su sporlarından tekne turlarına, bölgedeki en iyi aktiviteleri şeffaf fiyatlarla keşfet
            ve güvenle rezervasyon yap.
          </p>

          {/* GET formu: JavaScript olmadan da /ara?q=… adresine gider. */}
          <form
            action="/ara"
            method="get"
            className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
          >
            <div className="grid grid-cols-1 gap-sm">
              <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface p-3">
                <Icon name="search" className="text-outline" />
                <input
                  type="text"
                  defaultValue="Büyükçekmece"
                  placeholder="Nerede?"
                  aria-label="Nerede?"
                  className="w-full border-none bg-transparent p-0 text-body-md outline-none placeholder:text-outline focus:ring-0"
                />
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface p-3">
                <Icon name="kayaking" className="text-outline" />
                <input
                  type="search"
                  name="q"
                  placeholder="Ne yapmak istiyorsun?"
                  aria-label="Ne yapmak istiyorsun?"
                  className="w-full border-none bg-transparent p-0 text-body-md outline-none placeholder:text-outline focus:ring-0"
                />
              </div>

              <div className="grid grid-cols-2 gap-sm">
                <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface p-3">
                  <Icon name="calendar_today" className="text-outline" />
                  <span className="text-body-md text-on-surface">Tarih</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface p-3">
                  <Icon name="group" className="text-outline" />
                  <span className="text-body-md text-on-surface">Kişi sayısı</span>
                </div>
              </div>

              <button
                type="submit"
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-headline-sm text-on-primary transition-transform active:scale-95"
              >
                <Icon name="search" filled />
                Ara
              </button>
            </div>
          </form>
        </section>

        {/* Hızlı kategoriler */}
        <section className="mb-xl overflow-hidden">
          <div className="scrollbar-hide -mx-container-margin flex gap-4 overflow-x-auto px-container-margin pb-4">
            {CATEGORIES.map(({ id, label, icon }) => (
              <Link
                key={id}
                href={`/ara?kategori=${id}`}
                className="flex min-w-[72px] flex-col items-center gap-2"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface-variant transition-colors hover:bg-secondary-container hover:text-on-secondary-container">
                  <Icon name={icon} size={30} />
                </div>
                <span className="text-label-sm text-on-surface-variant">{label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Popüler deneyimler */}
        <section className="mb-xl">
          <h2 className="mb-lg text-headline-md text-on-background">
            Yakınındaki popüler deneyimler
          </h2>
          <div className="grid grid-cols-1 gap-md md:grid-cols-2">
            {popular.map((activity) => (
              <ActivityCard key={activity.slug} activity={activity} />
            ))}
          </div>
        </section>

        {/* Bugün müsait */}
        <section className="mb-xl -mx-container-margin bg-surface-container-low px-container-margin py-lg">
          <div className="mb-md flex items-end justify-between">
            <div>
              <h2 className="text-headline-md text-on-background">Bugün Müsait</h2>
              <p className="text-body-md text-on-surface-variant">
                Büyükçekmece&apos;de hemen rezerve et
              </p>
            </div>
            <Link href="/ara" className="text-label-bold text-primary">
              Tümü
            </Link>
          </div>

          <div className="scrollbar-hide flex gap-4 overflow-x-auto pb-4">
            {availableToday.map((activity) => (
              <CompactActivityCard key={activity.slug} activity={activity} />
            ))}
          </div>
        </section>
      </main>

      <BottomNavBar />
    </div>
  );
}
