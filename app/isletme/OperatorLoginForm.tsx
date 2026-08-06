'use client';

import { useActionState } from 'react';
import {
  operatorCancelLoginAction,
  operatorLoginAction,
  operatorVerifyAction,
  type LoginState,
} from '@/app/actions/operator';

const FIELD =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none';

const CARD =
  'flex flex-col gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card';

export function OperatorLoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    operatorLoginAction,
    {},
  );

  // Parola doğrulandıysa ekran ikinci faktöre geçer. Bu noktada oturum HENÜZ
  // açılmadı; asıl giriş kod doğrulandıktan sonra olur.
  if (state.step === 'code') {
    return <SecondFactorForm phoneHint={state.phoneHint} />;
  }

  return (
    <form action={action} className={CARD}>
      <div>
        <label
          htmlFor="email"
          className="mb-1 block text-label-bold text-on-surface-variant"
        >
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
        <label
          htmlFor="password"
          className="mb-1 block text-label-bold text-on-surface-variant"
        >
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
        Parolanızı unuttuysanız işletme sahibine yeni parola oluşturmasını
        söyleyin. Hesaplar kişiye özeldir; paylaşmayın.
      </p>
    </form>
  );
}

function SecondFactorForm({ phoneHint }: { phoneHint?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    operatorVerifyAction,
    {
      step: 'code',
      phoneHint,
    },
  );

  const hint = state.phoneHint ?? phoneHint;

  return (
    <div className="flex flex-col gap-sm">
      <form action={action} className={CARD}>
        <div>
          <h2 className="mb-1 text-headline-sm text-on-surface">
            Doğrulama kodu
          </h2>
          <p className="text-body-md text-on-surface-variant">
            {hint ? `${hint} numarasına` : 'Telefonunuza'} gönderilen 6 haneli
            kodu girin. Kod 5 dakika geçerli.
          </p>
        </div>

        <div>
          <label
            htmlFor="code"
            className="mb-1 block text-label-bold text-on-surface-variant"
          >
            Kod
          </label>
          <input
            id="code"
            name="code"
            required
            // Telefonda sayı tuş takımı açılsın ve SMS otomatik doldurma çalışsın.
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]{6}"
            autoFocus
            className={`${FIELD} text-center font-mono text-headline-md tracking-[0.4em]`}
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
          {pending ? 'Doğrulanıyor…' : 'Doğrula ve Gir'}
        </button>
      </form>

      {/*
        Ayrı form: 'baştan başla' yalnızca ekranı değiştirmez, bekleyen giriş
        çerezini sunucuda da geçersiz kılar — aksi hâlde 5 dakika boyunca
        ortada kod bekleyen bir hesap kalırdı.
      */}
      <form action={operatorCancelLoginAction}>
        <button
          type="submit"
          className="w-full text-center text-label-bold text-on-surface-variant underline"
        >
          Baştan başla
        </button>
      </form>
    </div>
  );
}
