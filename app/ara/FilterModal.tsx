'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';

const DURATIONS = ['1-2 Saat', 'Yarım Gün', 'Tam Gün'];

/**
 * Alttan açılan filtre paneli.
 *
 * Panel her zaman DOM'da kalır; açılış/kapanış yalnızca sınıf değişimiyle
 * yapılır. Böylece CSS geçişi mount anına bağlı kalmaz ve prototipteki iki
 * aşamalı `toggleFilterModal()` numarasına gerek kalmaz. Kapalıyken tıklamayı
 * engellememesi için `pointer-events-none` ve erişilebilirlik ağacından
 * çıkması için `inert` uygulanır.
 */
export function FilterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [duration, setDuration] = useState(DURATIONS[0]);

  // Panel açıkken arkadaki içeriğin kaymasını engeller.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Filtreler"
      inert={!open}
      onClick={onClose}
      // z-60: alt navigasyon z-50'de duruyor; panel onun da üstünü örtmeli,
      // yoksa panelin alt aksiyonları ("Temizle" / "Uygula") nav'ın altında kalır.
      className={`fixed inset-0 z-60 flex flex-col justify-end bg-inverse-surface/50 transition-opacity duration-300 ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex h-[80vh] w-full transform flex-col rounded-t-xl bg-surface transition-transform duration-300 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-surface-variant p-md">
          <h2 className="text-headline-sm text-on-surface">Filtreler</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-full p-2 text-on-surface-variant active:scale-95"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-lg overflow-y-auto p-container-margin">
          <div className="flex flex-col gap-sm">
            <h3 className="text-label-bold tracking-wider text-outline uppercase">Fiyat Aralığı</h3>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="mb-1 block text-label-sm text-outline" htmlFor="price-min">
                  Min (TL)
                </label>
                <input
                  id="price-min"
                  type="number"
                  placeholder="0"
                  className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-body-md focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <span className="mt-5 text-outline-variant">-</span>
              <div className="flex-1">
                <label className="mb-1 block text-label-sm text-outline" htmlFor="price-max">
                  Maks (TL)
                </label>
                <input
                  id="price-max"
                  type="number"
                  placeholder="5000+"
                  className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-body-md focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-sm">
            <h3 className="text-label-bold tracking-wider text-outline uppercase">Süre</h3>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  aria-pressed={duration === d}
                  className={`rounded-full border px-4 py-2 text-label-bold ${
                    duration === d
                      ? 'border-primary-container bg-primary-container text-on-primary-container'
                      : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-sm flex flex-col gap-md">
            <Toggle label="Ücretsiz İptal" />
            <Toggle label="Ekipman Dahil" defaultChecked />
          </div>
        </div>

        <div className="flex gap-4 border-t border-surface-variant bg-surface p-md">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 text-center text-label-bold text-on-surface-variant transition-transform active:scale-95"
          >
            Temizle
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-primary py-3 text-center text-label-bold text-on-primary shadow-sm transition-transform active:scale-95"
          >
            Uygula
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, defaultChecked = false }: { label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-body-md text-on-surface">{label}</span>
      <div className="relative">
        <input type="checkbox" defaultChecked={defaultChecked} className="peer sr-only" />
        <div className="peer h-6 w-11 rounded-full bg-surface-variant after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none" />
      </div>
    </label>
  );
}
