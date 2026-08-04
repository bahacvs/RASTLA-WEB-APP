'use client';

import { useActionState, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { formatPrice } from '@/lib/format';
import { createBookingAction, slotsForDate, type BookingFormState } from '@/app/actions/booking';
import type { Activity } from '@/lib/catalog';
import type { Slot } from '@/lib/db/slots';

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

  for (let i = leading - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, currentMonth: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, currentMonth: true });
  return cells;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function BookingView({
  activity,
  availableDates,
  initialDate,
  initialSlots,
}: {
  activity: Activity;
  /** Boş yeri olan günler; takvimde yalnızca bunlar seçilebilir. */
  availableDates: string[];
  initialDate: string | null;
  initialSlots: Slot[];
}) {
  const router = useRouter();
  const available = useMemo(() => new Set(availableDates), [availableDates]);

  const first = initialDate ? new Date(`${initialDate}T00:00:00`) : new Date();
  const [month, setMonth] = useState(first.getMonth());
  const [year, setYear] = useState(first.getFullYear());

  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [slotId, setSlotId] = useState<string>(initialSlots[0]?.id ?? '');
  const [loadingSlots, startLoading] = useTransition();

  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const total = (adults + children) * activity.priceTRY;
  const party = adults + children;
  // Slottan düşecek birim; işletmenin aktivite için seçtiği kapasite moduna bağlı.
  const units = activity.capacityMode === 'per_person' ? party : 1;

  const selectedSlot = slots.find((s) => s.id === slotId);
  const ready = Boolean(selectedDate && selectedSlot && selectedSlot.remaining >= units);

  const [state, formAction, pending] = useActionState<BookingFormState, FormData>(
    createBookingAction,
    {}
  );

  function pickDate(date: string) {
    setSelectedDate(date);
    setSlotId('');
    startLoading(async () => {
      const next = await slotsForDate(activity.slug, date);
      setSlots(next);
      setSlotId(next.find((s) => s.remaining >= units)?.id ?? '');
    });
  }

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  const dateLabel = selectedDate
    ? `${Number(selectedDate.slice(8))} ${MONTHS[Number(selectedDate.slice(5, 7)) - 1]} ${selectedDate.slice(0, 4)}`
    : null;

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

      <form action={formAction}>
        {/* Seçimler gizli alanlarla taşınır; tutar ve kapasite sunucuda doğrulanır. */}
        <input type="hidden" name="slug" value={activity.slug} />
        <input type="hidden" name="slotId" value={slotId} />
        <input type="hidden" name="adults" value={adults} />
        <input type="hidden" name="children" value={children} />

        {/* max-w-[32rem]: `max-w-lg` @theme'deki --spacing-lg tokenı yüzünden kullanılamıyor. */}
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
                {cells.map((cell, i) => {
                  if (!cell.currentMonth) {
                    return (
                      <div key={`p-${i}`} className="py-2 text-outline">
                        {cell.day}
                      </div>
                    );
                  }

                  const date = isoDate(year, month, cell.day);
                  const selectable = available.has(date);
                  const selected = selectedDate === date;

                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={!selectable}
                      onClick={() => pickDate(date)}
                      aria-pressed={selected}
                      title={selectable ? undefined : 'Bu gün için müsait saat yok'}
                      className={`rounded-full py-2 ${
                        selected
                          ? 'bg-primary font-bold text-on-primary shadow-sm'
                          : selectable
                            ? 'cursor-pointer hover:bg-surface-container'
                            : 'cursor-not-allowed text-outline/50'
                      }`}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="mb-sm block text-label-bold text-on-surface-variant">Saat Seçin</span>

              {loadingSlots ? (
                <p className="py-4 text-center text-body-md text-on-surface-variant">
                  Saatler yükleniyor…
                </p>
              ) : slots.length === 0 ? (
                <p className="py-4 text-center text-body-md text-on-surface-variant">
                  {selectedDate ? 'Bu gün için müsait saat yok.' : 'Önce bir gün seçin.'}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-sm">
                  {slots.map((slot) => {
                    const active = slotId === slot.id;
                    const fits = slot.remaining >= units;

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={!fits}
                        onClick={() => setSlotId(slot.id)}
                        aria-pressed={active}
                        title={fits ? undefined : 'Bu saatte yeterli yer yok'}
                        className={`flex flex-col items-center justify-center rounded-lg py-2 text-body-md transition-colors ${
                          active
                            ? 'border-2 border-primary bg-primary-fixed font-bold text-primary shadow-card'
                            : fits
                              ? 'border border-outline-variant text-on-surface hover:border-primary'
                              : 'cursor-not-allowed border border-outline-variant text-outline/60'
                        }`}
                      >
                        {slot.time}
                        <span className="text-label-sm font-normal">
                          {fits ? `${slot.remaining} yer` : 'Dolu'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
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

            {selectedSlot && selectedSlot.remaining < units && (
              <p className="mt-md rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container">
                Seçilen saatte {selectedSlot.remaining} yer kaldı. Katılımcı sayısını azaltın ya da
                başka bir saat seçin.
              </p>
            )}
          </section>

          {/* Adım 3 — özet */}
          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
            <h2 className="mb-sm text-headline-sm text-on-surface">Özet ve Toplam</h2>

            <div className="mb-md space-y-xs text-body-md text-on-surface-variant">
              <div className="flex justify-between">
                <span>
                  {dateLabel ?? 'Tarih seçilmedi'}
                  {selectedSlot && ` - ${selectedSlot.time}`}
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

          {/* Adım 4 — iletişim */}
          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
            <h2 className="mb-md text-headline-sm text-on-surface">İletişim Bilgileri</h2>

            <div className="flex flex-col gap-sm">
              <div>
                <label htmlFor="name" className="mb-1 block text-label-bold text-on-surface-variant">
                  Ad Soyad
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  minLength={2}
                  autoComplete="name"
                  className="h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="phone" className="mb-1 block text-label-bold text-on-surface-variant">
                  Telefon
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="05XX XXX XX XX"
                  className="h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            {/*
              Bilgilendirme, onay kutucuğu DEĞİL. Rezervasyonun hukuki dayanağı
              sözleşmenin ifası (KVKK md. 5/2-c); ad ve telefon hizmeti vermek
              için zorunlu. Rıza istemek yanlış dayanak olur ve var olmayan bir
              reddetme hakkı ima ederdi.
            */}
            <p className="mt-md text-label-sm text-on-surface-variant">
              Ad ve telefon bilginiz, rezervasyonunuzun oluşturulması ve hizmeti verecek
              işletmenin sizinle iletişim kurabilmesi için işlenir ve yalnızca o işletmeyle
              paylaşılır. Ayrıntı için{' '}
              <Link href="/aydinlatma" className="text-primary underline">
                Aydınlatma Metni
              </Link>{' '}
              ve{' '}
              <Link href="/gizlilik" className="text-primary underline">
                Gizlilik Politikası
              </Link>
              .
            </p>

            {state.error && (
              <p
                role="alert"
                className="mt-md rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container"
              >
                {state.error}
              </p>
            )}

            {/* Masaüstünde yapışkan çubuk gizli olduğu için aksiyon burada durur. */}
            <div className="mt-md hidden md:block">
              <BookingAction ready={ready} pending={pending} className="w-full" />
            </div>
          </section>

          <p className="pb-4 text-label-sm text-on-surface-variant">
            Rezervasyonunuz oluşturulduğunda QR kodlu biletiniz hazırlanır. Ödeme deneyim yerinde
            alınır; online ödeme henüz devrede değildir.
          </p>
        </main>

        {/* Mobil yapışkan toplam çubuğu */}
        <div className="fixed bottom-0 z-50 flex w-full items-center justify-between border-t border-outline-variant bg-surface p-md shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:hidden">
          <div>
            <span className="block text-label-sm text-on-surface-variant">Toplam Tutar</span>
            <span className="text-title-price text-on-surface">{formatPrice(total)}</span>
          </div>
          <BookingAction ready={ready} pending={pending} />
        </div>
      </form>
    </div>
  );
}

/**
 * Rezervasyon gönderme butonu.
 *
 * Yeterli yeri olan bir slot seçilmeden aktifleşmez; gönderim sırasında
 * kilitlenir ki çift tıklama iki rezervasyon oluşturmasın.
 */
function BookingAction({
  ready,
  pending,
  className = '',
}: {
  ready: boolean;
  pending: boolean;
  className?: string;
}) {
  const disabled = !ready || pending;

  return (
    <button
      type="submit"
      disabled={disabled}
      title={ready ? undefined : 'Önce müsait bir tarih ve saat seçin'}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-center text-headline-sm text-on-primary shadow-sm transition-all hover:bg-primary-container active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {pending ? 'Oluşturuluyor…' : 'Rezervasyonu Tamamla'}
    </button>
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
