'use client';

import { useActionState } from 'react';
import { deleteAccountAction, type AccountState } from '@/app/actions/account';

/**
 * Silme geri alınamaz olduğu için tek tıkla yapılmaz: kullanıcı kutuya SİL
 * yazar. Aktif rezervasyon varsa ne olacağı da açıkça sorulur — sessizce
 * iptal etmek, işletmenin beklediği bir misafiri ortadan kaldırmak olurdu.
 */
export function DeleteAccountForm({ activeCount }: { activeCount: number }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    deleteAccountAction,
    {}
  );

  return (
    <form action={action} className="flex flex-col gap-sm">
      {activeCount > 0 && (
        <label className="flex items-start gap-2 rounded-lg bg-surface-container p-3">
          <input
            type="checkbox"
            name="cancelActive"
            className="mt-1 size-4 rounded border-outline text-primary focus:ring-primary"
          />
          <span className="text-body-md text-on-surface-variant">
            <strong className="text-on-surface">
              {activeCount} aktif rezervasyonum var.
            </strong>{' '}
            Hesabımla birlikte bunları da iptal et. İşaretlemezseniz hesap silinmez:
            işletmenin sizi karşılayabilmesi için adınıza ihtiyacı var.
          </span>
        </label>
      )}

      <div>
        <label htmlFor="confirm" className="mb-1 block text-label-bold text-on-surface-variant">
          Onaylamak için kutuya <strong className="text-error">SİL</strong> yazın
        </label>
        <input
          id="confirm"
          name="confirm"
          required
          autoComplete="off"
          className="h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-error focus:outline-none"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container"
        >
          {state.error}
          {state.activeCodes && state.activeCodes.length > 0 && (
            <span className="mt-1 block font-mono text-label-sm">
              {state.activeCodes.join(', ')}
            </span>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-error py-3 text-headline-sm text-on-error transition-transform active:scale-95 disabled:opacity-50"
      >
        {pending ? 'Siliniyor…' : 'Hesabımı Kalıcı Olarak Sil'}
      </button>
    </form>
  );
}
