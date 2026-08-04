'use client';

import { useActionState } from 'react';
import { operatorLoginAction, type LoginState } from '@/app/actions/operator';

const FIELD =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none';

export function OperatorLoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(operatorLoginAction, {});

  return (
    <form
      action={action}
      className="flex flex-col gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
    >
      <div>
        <label htmlFor="email" className="mb-1 block text-label-bold text-on-surface-variant">
          E-posta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-label-bold text-on-surface-variant">
          Parola
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={FIELD}
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary py-3 text-headline-sm text-on-primary transition-transform active:scale-95 disabled:opacity-50"
      >
        {pending ? 'Kontrol ediliyor…' : 'Giriş Yap'}
      </button>

      <p className="text-label-sm text-on-surface-variant">
        Parolanızı unuttuysanız işletme sahibine yeni parola oluşturmasını söyleyin. Hesaplar
        kişiye özeldir; paylaşmayın.
      </p>
    </form>
  );
}
