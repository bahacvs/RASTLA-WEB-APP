'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { formatPrice } from '@/lib/format';
import type { Activity } from '@/lib/data';

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/** Ayın günlerini pazartesi başlangıçlı bir ızgaraya yerleştirir. */
function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // getDay(): 0 = Pazar. Pazartesi başlangıcına kaydır.
  const leading = (first.getDay() + 6) % 7;

  const cells: { day: number; currentMonth: boolean }[] = [];
  const prevMonthDays = new Date(year, month, 0).getDate();

  for (let i = leading - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, currentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true });
  }
  return cells;
}

export function BookingView({ activity }: { activity: Activity }) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);

  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [slot, setSlot] = useState(activity.timeSlots?.[0]?.time ?? '');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const slots = activity.timeSlots ?? [];
  const selectedSlot = slots.find((s) => s.time === slot);

  // Bu fazda çocuk indirimi tanımlı değil; herkes kişi başı fiyattan sayılır.
  const total = (adults + children) * activity.priceTRY;

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelectedDay(null);
  }

  return (
    <div className="pb-32 md:pb-12">
      <header className="fixed top-0 z-50 mx-auto flex h-16 w-full max-w-7xl items-center justify-between border-b border-surface-variant bg-surface px-container-margin shadow-sm">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Geri"
            className="rounded-full p-2 text-on-surface-variant transition-transform hover:bg-surface-container-low active:scale-95"
          >
            <Icon name="arrow_back" />
          </button>
          <h1 className="text-headline-sm text-primary">Rezervasyon</h1>
        </div>
      </header>

      {/* max-w-[32rem]: `max-w-lg` kullanılamıyor — @theme'deki --spacing-lg
          tokenı Tailwind'in --container-lg değerini gölgeliyor. */}
      <main className="mx-auto mt-20 max-w-[32rem] space-y-lg px-container-margin">
        {/* Adım 1 — tarih ve saat */}
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
          <h2 className="mb-md text-headline-sm text-on-surface">Tarih ve Saat Seçimi</h2>

          <div className="mb-lg">
            <div className="mb-sm flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Önceki ay"
                className="rounded-full p-1 hover:bg-surface-container"
              >
                <Icon name="chevron_left" className="text-on-surface-variant" />
              </button>
              <span className="text-label-bold text-on-surface">
                {MONTHS[month]} {year}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Sonraki ay"
                className="rounded-full p-1 hover:bg-surface-container"
              >
                <Icon name="chevron_right" className="text-on-surface-variant" />
              </button>
            </div>

            <div className="mb-sm grid grid-cols-7 gap-1 text-center text-label-sm text-on-surface-variant">
              {WEEKDAYS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-body-md">
              {cells.map((cell, i) =>
                cell.currentMonth ? (
                  <button
                    key={`d-${cell.day}`}
                    type="button"
                    onClick={() => setSelectedDay(cell.day)}
                    aria-pressed={selectedDay === cell.day}
                    className={`rounded-full py-2 ${
                      selectedDay === cell.day
                        ? 'bg-primary font-bold text-on-primary shadow-sm'
                        : 'cursor-pointer hover:bg-surface-container'
                    }`}
                  >
                    {cell.day}
                  </button>
                ) : (
                  <div key={`p-${i}`} className="py-2 text-outline">
                    {cell.day}
                  </div>
                )
              )}
            </div>
          </div>

          {slots.length > 0 && (
            <div>
              <span className="mb-sm block text-label-bold text-on-surface-variant">Saat Seçin</span>
              <div className="grid grid-cols-2 gap-sm">
                {slots.map((s) => {
                  const active = slot === s.time;
                  return (
                    <button
                      key={s.time}
                      type="button"
                      onClick={() => setSlot(s.time)}
                      aria-pressed={active}
                      className={`flex items-center justify-center gap-1 rounded-lg py-2 text-body-md transition-colors ${
                        active
                          ? 'border-2 border-primary bg-primary-fixed font-bold text-primary shadow-card'
                          : 'border border-outline-variant text-on-surface hover:border-primary'
                      }`}
                    >
                      {s.time}
                      {s.note && (
                        <span
                          className={`text-label-sm font-normal ${
                            active ? 'text-on-primary-fixed-variant' : 'text-on-surface-variant'
                          }`}
                        >
                          ({s.note})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Adım 2 — katılımcılar */}
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
          <h2 className="mb-md text-headline-sm text-on-surface">Katılımcı Sayısı</h2>

          <Counter
            label="Yetişkin"
            hint="12+ yaş"
            value={adults}
            min={1}
            onChange={setAdults}
            className="mb-md"
          />
          <Counter label="Çocuk" hint="2-11 yaş" value={children} min={0} onChange={setChildren} />
        </section>

        {/* Adım 3 — özet */}
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
          <h2 className="mb-sm text-headline-sm text-on-surface">Özet ve Toplam</h2>

          <div className="mb-md space-y-xs text-body-md text-on-surface-variant">
            <div className="flex justify-between">
              <span>
                {selectedDay ? `${selectedDay} ${MONTHS[month]} ${year}` : 'Tarih seçilmedi'}
                {slot && ` - ${slot}`}
                {selectedSlot?.note && ` (${selectedSlot.note})`}
              </span>
            </div>

            <div className="flex justify-between">
              <span>
                {adults} Yetişkin x {formatPrice(activity.priceTRY)}
              </span>
              <span className="font-medium text-on-surface">
                {formatPrice(adults * activity.priceTRY)}
              </span>
            </div>

            {children > 0 && (
              <div className="flex justify-between">
                <span>
                  {children} Çocuk x {formatPrice(activity.priceTRY)}
                </span>
                <span className="font-medium text-on-surface">
                  {formatPrice(children * activity.priceTRY)}
                </span>
              </div>
            )}

            <div className="border-b border-dashed border-outline-variant pb-sm" />
          </div>

          <div className="mt-sm flex items-center justify-between">
            <span className="text-body-lg font-semibold text-on-surface">Toplam</span>
            <span className="text-title-price text-primary">{formatPrice(total)}</span>
          </div>
        </section>

        <p className="pb-4 text-label-sm text-on-surface-variant">
          Bu bir arayüz prototipidir. Ödeme altyapısı ve rezervasyon kaydı henüz bağlı değildir.
        </p>
      </main>

      {/* Mobil yapışkan toplam çubuğu */}
      <div className="fixed bottom-0 z-50 flex w-full items-center justify-between border-t border-outline-variant bg-surface p-md shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:hidden">
        <div>
          <span className="block text-label-sm text-on-surface-variant">Toplam Tutar</span>
          <span className="text-title-price text-on-surface">{formatPrice(total)}</span>
        </div>
        <button
          type="button"
          disabled={!selectedDay || !slot}
          className="rounded-xl bg-primary px-6 py-3 text-headline-sm text-on-primary shadow-sm transition-all hover:bg-primary-container active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ödemeye Geç
        </button>
      </div>
    </div>
  );
}

function Counter({
  label,
  hint,
  value,
  min,
  onChange,
  className = '',
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const canDecrease = value > min;

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div>
        <div className="text-body-lg font-semibold text-on-surface">{label}</div>
        <div className="text-label-sm text-on-surface-variant">{hint}</div>
      </div>

      <div className="flex items-center gap-sm">
        <button
          type="button"
          onClick={() => canDecrease && onChange(value - 1)}
          disabled={!canDecrease}
          aria-label={`${label} sayısını azalt`}
          className={`flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant active:scale-95 ${
            canDecrease
              ? 'text-on-surface-variant hover:bg-surface-container'
              : 'cursor-not-allowed text-outline opacity-50'
          }`}
        >
          <Icon name="remove" size={20} />
        </button>

        <span className="w-4 text-center text-body-lg font-semibold text-on-surface">{value}</span>

        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={`${label} sayısını artır`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant text-primary hover:bg-primary-fixed active:scale-95"
        >
          <Icon name="add" size={20} />
        </button>
      </div>
    </div>
  );
}
