'use client';

import { useActionState } from 'react';
import { operatorSignupAction, type SignupState } from '@/app/actions/signup';
import { FIELD, LABEL, PRIMARY_BUTTON } from '@/components/form';

export function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(
    operatorSignupAction,
    {}
  );

  /** Hatalı alanı işaretler: uzun formda "hangisi" sorusu ekranda cevaplanmalı. */
  const ring = (field: string) =>
    state.field === field ? `${FIELD} border-error ring-2 ring-error` : FIELD;

  return (
    <form action={action} className="flex flex-col gap-sm">
      <div>
        <label htmlFor="operatorName" className={LABEL}>
          İşletme adı
        </label>
        <input
          id="operatorName"
          name="operatorName"
          type="text"
          required
          minLength={2}
          autoComplete="organization"
          placeholder="Martı Koyu Su Sporları"
          className={ring('operatorName')}
        />
      </div>

      <div>
        <label htmlFor="userName" className={LABEL}>
          Adınız soyadınız
        </label>
        <input
          id="userName"
          name="userName"
          type="text"
          required
          minLength={2}
          autoComplete="name"
          className={ring('userName')}
        />
      </div>

      <div>
        <label htmlFor="email" className={LABEL}>
          E-posta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={ring('email')}
        />
      </div>

      <div>
        <label htmlFor="phone" className={LABEL}>
          Cep telefonu
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="05XX XXX XX XX"
          className={ring('phone')}
        />
        <p className="mt-1 text-label-sm text-on-surface-variant">
          Girişte parolanızın yanında bu numaraya kod gönderilir. Bilet onayı geri alınamayan bir
          işlem; parolası ele geçen bir hesabın tek başına girebilmesi en pahalı hatanın kapısı
          olurdu.
        </p>
      </div>

      <div>
        <label htmlFor="password" className={LABEL}>
          Parola
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className={ring('password')}
        />
        <p className="mt-1 text-label-sm text-on-surface-variant">En az 10 karakter.</p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={`mt-sm ${PRIMARY_BUTTON}`}>
        {pending ? 'Hesap açılıyor…' : 'Hesabımı Aç'}
      </button>
    </form>
  );
}
