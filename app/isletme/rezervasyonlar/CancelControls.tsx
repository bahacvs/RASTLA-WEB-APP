'use client';

import { useActionState, useState } from 'react';
import {
  cancelDayAction,
  operatorCancelAction,
  type OperatorCancelState,
} from '@/app/actions/operator';
import { Icon } from '@/components/Icon';

/** Tek bir rezervasyonu iptal eder. Onay ister; iptal geri alınamaz. */
export function CancelBookingButton({ code }: { code: string }) {
  const [state, action, pending] = useActionState<OperatorCancelState, FormData>(
    operatorCancelAction,
    {}
  );
  const [confirming, setConfirming] = useState(false);

  if (state.message) {
    return <p className="text-label-sm text-on-surface-variant">{state.message}</p>;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-label-bold text-on-surface-variant hover:underline"
      >
        İptal et
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="code" value={code} />
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-label-bold text-on-surface-variant"
      >
        Vazgeç
      </button>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-error-container px-3 py-1 text-label-bold text-on-error-container disabled:opacity-50"
      >
        {pending ? '…' : 'Onayla'}
      </button>
      {state.error && <span className="text-label-sm text-error">{state.error}</span>}
    </form>
  );
}

/**
 * Hava koşulu nedeniyle günün tamamını iptal eder.
 *
 * Su sporlarında en sık iptal sebebi budur ve tek tek iptal etmek sahilde
 * pratik değildir. İptal edilen rezervasyonlar 'weather' sebebiyle kaydedilir;
 * müşteri kusurlu olmadığı için iade politikası farklı işleyecektir.
 */
export function CancelDayButton({ date, count }: { date: string; count: number }) {
  const [state, action, pending] = useActionState<OperatorCancelState, FormData>(
    cancelDayAction,
    {}
  );
  const [confirming, setConfirming] = useState(false);

  if (state.message) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md text-body-md text-on-surface-variant shadow-card">
        {state.message}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
      {confirming ? (
        <form action={action} className="flex flex-col gap-sm">
          <input type="hidden" name="date" value={date} />
          <p className="text-body-md text-on-surface">
            Bu günün <strong>{count}</strong> aktif rezervasyonu hava koşulu nedeniyle iptal
            edilecek ve slot kapasiteleri geri verilecek. Misafirleri ayrıca bilgilendirmeniz
            gerekir.
          </p>
          <div className="flex gap-sm">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-lg border border-outline-variant py-2 text-label-bold text-on-surface-variant"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-error-container py-2 text-label-bold text-on-error-container disabled:opacity-50"
            >
              {pending ? 'İptal ediliyor…' : 'Evet, günü iptal et'}
            </button>
          </div>
          {state.error && (
            <p role="alert" className="text-body-md text-error">
              {state.error}
            </p>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={count === 0}
          className="flex w-full items-center justify-center gap-2 text-label-bold text-on-surface-variant disabled:opacity-50"
        >
          <Icon name="close" size={18} />
          Hava nedeniyle günü iptal et
        </button>
      )}
    </div>
  );
}
