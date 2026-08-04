'use client';

import { useActionState } from 'react';
import { operatorLoginAction, type LoginState } from '@/app/actions/operator';
import type { Operator } from '@/lib/operators';

export function OperatorLoginForm({ operators }: { operators: Operator[] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(operatorLoginAction, {});

  return (
    <form
      action={action}
      className="flex flex-col gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
    >
      <div>
        <label htmlFor="operatorId" className="mb-1 block text-label-bold text-on-surface-variant">
          İşletme
        </label>
        <select
          id="operatorId"
          name="operatorId"
          required
          className="h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
        >
          {operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="code" className="mb-1 block text-label-bold text-on-surface-variant">
          Erişim kodu
        </label>
        <input
          id="code"
          name="code"
          type="password"
          required
          autoComplete="current-password"
          className="h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
        />
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container">
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
    </form>
  );
}
