'use client';

import { useActionState, useState } from 'react';
import { cancelAgencyBookingAction, type AgencyCancelState } from '@/app/actions/agency';

/** Acente kendi tuttuğu yeri bırakır. Onay ister; iptal geri alınamaz. */
export function CancelAgencyBookingButton({ code }: { code: string }) {
  const [state, action, pending] = useActionState<AgencyCancelState, FormData>(
    cancelAgencyBookingAction,
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
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="code" value={code} />
      <span className="text-label-sm text-on-surface-variant">
        Yer serbest bırakılacak ve misafire bilgi mesajı gidecek.
      </span>
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
