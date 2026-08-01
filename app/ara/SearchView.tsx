'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Icon } from '@/components/Icon';
import { SearchResultCard } from '@/components/SearchResultCard';
import { BottomNavBar } from '@/components/BottomNavBar';
import { FilterModal } from './FilterModal';
import {
  CATEGORIES,
  MAP_IMAGE,
  MAP_PINS,
  searchActivities,
  type ActivityCategory,
} from '@/lib/data';
import { formatPrice } from '@/lib/format';

export function SearchView({
  initialQuery = '',
  initialCategory,
}: {
  initialQuery?: string;
  initialCategory?: ActivityCategory;
}) {
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<ActivityCategory | undefined>(initialCategory);

  const results = useMemo(() => searchActivities({ query, category }), [query, category]);

  return (
    <div className="pb-[80px]">
      {/* Yapışkan üst alan: başlık, arama, filtreler, görünüm anahtarı */}
      <div className="sticky top-0 z-40 rounded-b-xl border-b border-surface-variant bg-surface pb-md shadow-sm">
        <header className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-container-margin text-primary">
          <button
            type="button"
            aria-label="Konumu değiştir"
            className="rounded-full p-2 transition-colors hover:bg-surface-container-low active:scale-95"
          >
            <Icon name="location_on" />
          </button>
          <div className="text-display-lg tracking-tighter text-primary">RASTLA</div>
          <button
            type="button"
            aria-label="Bildirimler"
            className="rounded-full p-2 transition-colors hover:bg-surface-container-low active:scale-95"
          >
            <Icon name="notifications" />
          </button>
        </header>

        <div className="mt-xs px-container-margin">
          <div className="relative w-full">
            <span className="absolute top-1/2 left-sm -translate-y-1/2 text-outline">
              <Icon name="search" />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Aktivite, lokasyon ara..."
              aria-label="Aktivite, lokasyon ara"
              className="h-12 w-full rounded-[14px] border border-outline-variant bg-surface-container-lowest pr-4 pl-10 text-body-md text-on-surface shadow-card focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="scrollbar-hide mt-md flex gap-sm overflow-x-auto px-container-margin">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex items-center gap-xs rounded-full bg-secondary-container px-4 py-2 text-label-bold whitespace-nowrap text-on-secondary-container shadow-card transition-transform active:scale-95"
          >
            <Icon name="tune" size={18} />
            Filtrele
          </button>

          {/* Kategori çipleri. Aktif olan yeniden tıklanınca filtre kalkar. */}
          {CATEGORIES.map(({ id, label }) => {
            const active = category === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(active ? undefined : id)}
                aria-pressed={active}
                className={`rounded-full border px-4 py-2 text-label-bold whitespace-nowrap transition-transform active:scale-95 ${
                  active
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-md flex justify-center px-container-margin">
          <div className="flex w-full max-w-[240px] rounded-full bg-surface-container-low p-1">
            {(['list', 'map'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`flex-1 rounded-full py-1.5 text-center text-label-bold transition-colors ${
                  view === v
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant'
                }`}
              >
                {v === 'list' ? 'Liste' : 'Harita'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="relative min-h-[calc(100vh-250px)] w-full">
        {view === 'list' ? (
          <div className="flex flex-col gap-md p-container-margin">
            <p className="text-body-md text-on-surface-variant" aria-live="polite">
              {results.length > 0
                ? `${results.length} deneyim bulundu`
                : 'Aramanla eşleşen deneyim yok'}
            </p>

            {results.length > 0 ? (
              results.map((activity) => (
                <SearchResultCard key={activity.slug} activity={activity} />
              ))
            ) : (
              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg text-center shadow-card">
                <p className="mb-sm text-headline-sm text-on-surface">Sonuç bulunamadı</p>
                <p className="mb-md text-body-md text-on-surface-variant">
                  Farklı bir kelime deneyin ya da filtreleri temizleyin.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setCategory(undefined);
                  }}
                  className="rounded-lg bg-primary px-4 py-2 text-label-bold text-on-primary transition-transform active:scale-95"
                >
                  Filtreleri Temizle
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 h-full w-full">
            <div className="relative h-full w-full">
              <Image src={MAP_IMAGE.src} alt={MAP_IMAGE.alt} fill className="object-cover" />

              {/*
                Konumlar temsilî (gerçek harita sağlayıcısı henüz bağlı değil),
                ama fiyatlar filtrelenmiş sonuçlardan gelir — böylece harita ile
                liste birbiriyle çelişmez.
              */}
              {results.slice(0, MAP_PINS.length).map((activity, i) => (
                <div
                  key={activity.slug}
                  style={{ top: MAP_PINS[i].top, left: MAP_PINS[i].left }}
                  className={`absolute flex items-center gap-1 rounded-lg px-2 py-1 text-label-sm font-semibold shadow-md ${
                    MAP_PINS[i].highlighted
                      ? 'z-10 scale-110 bg-primary text-on-primary'
                      : 'border border-outline-variant bg-surface-container-lowest text-on-surface'
                  }`}
                >
                  {formatPrice(activity.priceTRY)}
                </div>
              ))}

              <button
                type="button"
                className="absolute top-sm left-1/2 -translate-x-1/2 rounded-full border border-outline-variant bg-surface-container-lowest px-4 py-2 text-label-bold whitespace-nowrap text-primary shadow-md transition-transform active:scale-95"
              >
                Bu alanda ara
              </button>
            </div>
          </div>
        )}
      </main>

      <FilterModal open={filtersOpen} onClose={() => setFiltersOpen(false)} />
      <BottomNavBar />
    </div>
  );
}
