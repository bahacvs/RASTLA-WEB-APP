'use client';

import { useActionState } from 'react';
import { platformLoginAction, type PlatformLoginState } from '@/app/actions/platform';

const FIELD =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none';

/**
 * RASTLA operasyon ekibinin girişi.
 *
 * İşletme girişindeki ikinci faktör burada YOK ve bu bilinçli bir eksiklik
 * değil, bilinçli bir sınır: platform hesaplarını SMS'e bağlamak, panelin
 * erişilebilirliğini bir dış sağlayıcıya bağlamak olurdu ve o sağlayıcı
 * çöktüğünde ilan onayı da dururdu. Hesap sayısı az ve kontrollü; ikinci
 * faktör bir sonraki turda donanım anahtarıyla (WebAuthn) eklenmeli — SMS
 * ile değil. Bu sınır README'de yazılı.
 */
export function PlatformLoginForm() {
  const [state, action, pending] = useActionState<PlatformLoginState, FormData>(
    platformLoginAction,
    {}
  );

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
        className="h-12 rounded-lg bg-primary text-label-bold text-on-primary transition-transform active:scale-95 disabled:opacity-60"
      >
        {pending ? 'Kontrol ediliyor…' : 'Giriş Yap'}
      </button>
    </form>
  );
}
