'use client';

import { useActionState, useState } from 'react';
import { createRuleAction, type ScheduleFormState } from '@/app/actions/activity';
import { timesForRule } from '@/lib/schedule-times.mjs';

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const FIELD =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none';
const LABEL = 'mb-1 block text-label-bold text-on-surface-variant';

/**
 * Takvim kuralı formu.
 *
 * "08:00'dan 18:00'e, 15 dakikada bir, her slotta 4 kişi" gibi bir tanım
 * yapılır ve slotlar bundan üretilir.
 */
/**
 * `prepMinutes` prop olarak geliyor çünkü hazırlık payı aktivitenin alanı ve
 * bu formun değil, aynı sayfadaki `LimitsForm`'un sorumluluğunda. Önizlemenin
 * onu bilmesi ŞART: bilmediğinde kullanıcıya üretilecek olandan fazla slot
 * vaat ediyordu.
 */
export function ScheduleForm({
  activityId,
  prepMinutes = 0,
}: {
  activityId: string;
  prepMinutes?: number;
}) {
  const [state, action, pending] = useActionState<ScheduleFormState, FormData>(createRuleAction, {});

  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('18:00');
  const [interval, setInterval] = useState(15);
  const [capacity, setCapacity] = useState(4);

  // Slot sayısı, sunucunun slotları üretirken kullandığı fonksiyonun
  // AYNISIYLA hesaplanıyor — ayrı bir formül tutmak ikisinin ayrışmasına yol
  // açmıştı (bkz. lib/schedule-times.ts).
  const perDay = timesForRule(
    { startTime: start, endTime: end, intervalMinutes: interval },
    prepMinutes
  ).length;

  return (
    <form
      action={action}
      className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
    >
      <input type="hidden" name="activityId" value={activityId} />

      <h2 className="mb-md text-headline-sm text-on-surface">Takvim Kuralı Ekle</h2>

      <div className="grid grid-cols-2 gap-sm">
        <div>
          <label className={LABEL} htmlFor="startTime">
            Başlangıç
          </label>
          <input
            id="startTime"
            name="startTime"
            type="time"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="endTime">
            Bitiş
          </label>
          <input
            id="endTime"
            name="endTime"
            type="time"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="intervalMinutes">
            Aralık (dakika)
          </label>
          <input
            id="intervalMinutes"
            name="intervalMinutes"
            type="number"
            min={5}
            step={5}
            required
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
            className={FIELD}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="capacity">
            Slot kapasitesi
          </label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            required
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            className={FIELD}
          />
        </div>
      </div>

      <fieldset className="mt-md">
        <legend className={LABEL}>Günler (boş bırakılırsa her gün)</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day, i) => (
            <label
              key={day}
              className="flex cursor-pointer items-center gap-1 rounded-full border border-outline-variant px-3 py-2 text-label-bold text-on-surface-variant"
            >
              <input type="checkbox" name={`weekday-${i}`} />
              {day}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="mt-md rounded-lg bg-surface-container-low px-3 py-2 text-body-md text-on-surface-variant">
        {perDay > 0 ? (
          <>
            Bu kural günde <strong className="text-on-surface">{perDay} slot</strong> üretir, her
            biri <strong className="text-on-surface">{capacity} kapasiteli</strong> — günlük toplam{' '}
            <strong className="text-on-surface">{perDay * capacity} yer</strong>.
          </>
        ) : (
          'Bitiş saati başlangıçtan sonra olmalı.'
        )}
      </p>

      {state.error && (
        <p
          role="alert"
          className="mt-md rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container"
        >
          {state.error}
        </p>
      )}

      {state.message && (
        <div className="mt-md rounded-lg bg-secondary-container px-3 py-2 text-body-md text-on-secondary-container">
          <p>{state.message}</p>
          {state.keptWithBookings ? (
            <p className="mt-1">
              {state.keptWithBookings} slot rezervasyonu olduğu için korundu — bunları elle
              kapatmanız gerekebilir.
            </p>
          ) : null}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || perDay === 0}
        className="mt-md w-full rounded-lg bg-primary py-3 text-headline-sm text-on-primary transition-transform active:scale-95 disabled:opacity-50"
      >
        {pending ? 'Slotlar üretiliyor…' : 'Kuralı Ekle ve Slotları Üret'}
      </button>
    </form>
  );
}
