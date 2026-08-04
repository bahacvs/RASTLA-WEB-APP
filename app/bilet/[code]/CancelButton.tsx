'use client';

import { useActionState, useState } from 'react';
import { cancelBookingAction, type CancelState } from '@/app/actions/booking';

/**
 * Müşterinin kendi rezervasyonunu iptal etmesi.
 *
 * İptal geri alınamaz olduğu için tek tıkla yapılmaz; önce onay istenir.
 */
export function CancelButton({ code }: { code: string }) {
  const [state, action, pending] = useActionState<CancelState, FormData>(cancelBookingAction, {});
  const [confirming, setConfirming] = useState(false);

  if (state.message) {
    return (
      <p className="rounded-lg bg-surface-container px-3 py-2 text-center text-body-md text-on-surface-variant">
        {state.message}
      </p>
    );
  }

  return (
    <div>
      {state.error && (
        <p
          role="alert"
          className="mb-sm rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container"
        >
          {state.error}
        </p>
      )}

      {confirming ? (
        <form action={action} className="flex flex-col gap-sm">
          <input type="hidden" name="code" value={code} />
          <p className="text-center text-body-md text-on-surface-variant">
            Rezervasyonunuz iptal edilecek ve yeriniz başkasına açılacak. Emin misiniz?
          </p>
          <div className="flex gap-sm">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-lg border border-outline-variant py-3 text-label-bold text-on-surface-variant"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-error-container py-3 text-label-bold text-on-error-container disabled:opacity-50"
            >
              {pending ? 'İptal ediliyor…' : 'Evet, iptal et'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-lg border border-outline-variant py-3 text-label-bold text-on-surface-variant transition-transform active:scale-95"
        >
          Rezervasyonu İptal Et
        </button>
      )}
    </div>
  );
}
