'use client';

import { useActionState, useState } from 'react';
import { rescheduleAction, type RescheduleState } from '@/app/actions/operator';
import { Icon } from '@/components/Icon';

export type SlotOption = {
  id: string;
  date: string;
  time: string;
  remaining: number;
};

/**
 * Rezervasyonu başka bir saate taşır.
 *
 * İptalin YANINDA duruyor, altında değil: hava bozduğunda ilk seçenek taşıma
 * olmalı — müşteri parasını değil aktiviteyi istiyor ve taşıma ne iade ne de
 * hak ediş kaydı açıyor.
 *
 * Seçenek listesi sunucudan geliyor ve yalnızca **yer kalan açık slotları**
 * içeriyor. Dolu bir saati listelemek, işletmeye tıkladıktan sonra reddedilen
 * bir düğme göstermek olurdu. Yine de son karar sunucuda: liste hazırlandıktan
 * sonra o yer başkasına gidebilir ve `rescheduleBooking` bunu koşullu
 * UPDATE'le yakalar.
 */
export function RescheduleControl({ code, options }: { code: string; options: SlotOption[] }) {
  const [state, action, pending] = useActionState<RescheduleState, FormData>(rescheduleAction, {});
  const [open, setOpen] = useState(false);

  if (state.message) {
    return <p className="text-label-sm text-on-surface-variant">{state.message}</p>;
  }

  if (options.length === 0) {
    return (
      <span className="text-label-sm text-outline" title="Yer kalan başka saat yok">
        Taşınacak saat yok
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-label-bold text-on-surface-variant hover:underline"
      >
        <Icon name="calendar_today" size={16} />
        Saati değiştir
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="code" value={code} />
      <select
        name="slotId"
        defaultValue={options[0].id}
        className="h-9 rounded-lg border border-outline-variant bg-surface px-2 text-body-md"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.date} {option.time} · {option.remaining} yer
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-label-bold text-on-surface-variant"
      >
        Vazgeç
      </button>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-secondary-container px-3 py-1 text-label-bold text-on-secondary-container disabled:opacity-50"
      >
        {pending ? 'Taşınıyor…' : 'Taşı'}
      </button>
      {state.error && (
        <span role="alert" className="w-full text-right text-label-sm text-error">
          {state.error}
        </span>
      )}
    </form>
  );
}
