'use client';

import { useActionState } from 'react';
import {
  changeOwnPasswordAction,
  createTeamMemberAction,
  resetTeamPasswordAction,
  setTeamStatusAction,
  type TeamState,
} from '@/app/actions/team';

// lib/password.ts ile aynı değer. Oradan import edilemez: o modül node:crypto
// kullanır ve istemci paketine giremez. Asıl doğrulama zaten sunucuda yapılır;
// buradaki minLength yalnızca tarayıcı uyarısıdır.
const MIN_PASSWORD_LENGTH = 10;

const FIELD =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none';

const CARD =
  'flex flex-col gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card';

/**
 * Geçici parola yalnızca üretildiği anda gösterilir; veritabanında yalnızca
 * özeti var. Bu kutunun ekranda bırakılmaması gerektiğini kullanıcıya açıkça
 * söylemek, parolanın ekran görüntüsüyle dolaşmasından iyidir.
 */
function Feedback({ state }: { state: TeamState }) {
  return (
    <>
      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container"
        >
          {state.error}
        </p>
      )}
      {state.message && (
        <p
          role="status"
          className="rounded-lg bg-secondary-container px-3 py-2 text-body-md text-on-secondary-container"
        >
          {state.message}
        </p>
      )}
      {state.password && (
        <div className="rounded-lg border border-tertiary bg-surface-container p-3">
          <p className="mb-1 text-label-bold text-tertiary">
            Geçici parola — bir daha gösterilmeyecek
          </p>
          <code className="block font-mono text-body-lg break-all text-on-surface select-all">
            {state.password}
          </code>
          <p className="mt-1 text-label-sm text-on-surface-variant">
            Kişiye iletin ve ilk girişten sonra kendi parolasını belirlemesini söyleyin.
          </p>
        </div>
      )}
    </>
  );
}

export function AddMemberForm() {
  const [state, action, pending] = useActionState<TeamState, FormData>(createTeamMemberAction, {});

  return (
    <form action={action} className={CARD}>
      <div>
        <label htmlFor="name" className="mb-1 block text-label-bold text-on-surface-variant">
          Ad soyad
        </label>
        <input id="name" name="name" required className={FIELD} />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-label-bold text-on-surface-variant">
          E-posta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoCapitalize="none"
          spellCheck={false}
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor="role" className="mb-1 block text-label-bold text-on-surface-variant">
          Yetki
        </label>
        <select id="role" name="role" defaultValue="staff" className={FIELD}>
          <option value="staff">Personel — bilet okutur, rezervasyonları görür</option>
          <option value="owner">Sahip — aktivite, takvim ve ekip yönetir</option>
        </select>
      </div>

      <Feedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary py-3 text-headline-sm text-on-primary transition-transform active:scale-95 disabled:opacity-50"
      >
        {pending ? 'Ekleniyor…' : 'Ekle'}
      </button>
    </form>
  );
}

export function MemberControls({
  userId,
  name,
  status,
  isSelf,
}: {
  userId: string;
  name: string;
  status: 'active' | 'suspended';
  isSelf: boolean;
}) {
  const [resetState, resetAction, resetting] = useActionState<TeamState, FormData>(
    resetTeamPasswordAction,
    {}
  );
  const [statusState, statusAction, changing] = useActionState<TeamState, FormData>(
    setTeamStatusAction,
    {}
  );

  return (
    <div className="flex flex-col gap-sm border-t border-surface-variant pt-sm">
      <div className="flex flex-wrap gap-sm">
        <form action={resetAction}>
          <input type="hidden" name="userId" value={userId} />
          <button
            type="submit"
            disabled={resetting}
            className="rounded-lg border border-outline-variant px-4 py-2 text-label-bold text-on-surface-variant disabled:opacity-50"
          >
            {resetting ? 'Üretiliyor…' : 'Yeni parola üret'}
          </button>
        </form>

        {!isSelf && (
          <form action={statusAction}>
            <input type="hidden" name="userId" value={userId} />
            <input
              type="hidden"
              name="status"
              value={status === 'active' ? 'suspended' : 'active'}
            />
            <button
              type="submit"
              disabled={changing}
              className={`rounded-lg border px-4 py-2 text-label-bold disabled:opacity-50 ${
                status === 'active'
                  ? 'border-error text-error'
                  : 'border-primary text-primary'
              }`}
            >
              {status === 'active' ? `${name} hesabını askıya al` : 'Yeniden etkinleştir'}
            </button>
          </form>
        )}
      </div>

      <Feedback state={resetState} />
      <Feedback state={statusState} />
    </div>
  );
}

export function ChangeOwnPasswordForm() {
  const [state, action, pending] = useActionState<TeamState, FormData>(
    changeOwnPasswordAction,
    {}
  );

  return (
    <form action={action} className={CARD}>
      <div>
        <label htmlFor="current" className="mb-1 block text-label-bold text-on-surface-variant">
          Mevcut parola
        </label>
        <input
          id="current"
          name="current"
          type="password"
          required
          autoComplete="current-password"
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-label-bold text-on-surface-variant">
          Yeni parola (en az {MIN_PASSWORD_LENGTH} karakter)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor="repeat" className="mb-1 block text-label-bold text-on-surface-variant">
          Yeni parola (tekrar)
        </label>
        <input
          id="repeat"
          name="repeat"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className={FIELD}
        />
      </div>

      <Feedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary py-3 text-headline-sm text-on-primary transition-transform active:scale-95 disabled:opacity-50"
      >
        {pending ? 'Kaydediliyor…' : 'Parolayı Değiştir'}
      </button>
    </form>
  );
}
