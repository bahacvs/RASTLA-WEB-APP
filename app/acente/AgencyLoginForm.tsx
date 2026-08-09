'use client';

import { useActionState } from 'react';
import { agencyLoginAction, type AgencyLoginState } from '@/app/actions/agency';
import { FIELD, LABEL, PRIMARY_BUTTON } from '@/components/form';

export function AgencyLoginForm() {
  const [state, action, pending] = useActionState<AgencyLoginState, FormData>(
    agencyLoginAction,
    {}
  );

  return (
    <form action={action}>
      <div className="mb-sm">
        <label htmlFor="email" className={LABEL}>
          E-posta
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={FIELD} />
      </div>

      <div className="mb-sm">
        <label htmlFor="password" className={LABEL}>
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
        <p role="alert" className="mb-sm text-body-md text-error">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        {pending ? 'Giriş yapılıyor…' : 'Giriş Yap'}
      </button>
    </form>
  );
}
