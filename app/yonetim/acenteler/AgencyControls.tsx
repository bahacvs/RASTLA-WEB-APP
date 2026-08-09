'use client';

import { useActionState } from 'react';
import {
  createAgencyAction,
  createAgencyUserAction,
  setAgencyStatusAction,
  setAgencyUserStatusAction,
  type AgencyAdminState,
} from '@/app/actions/agency-admin';
import { FIELD, LABEL, PRIMARY_BUTTON } from '@/components/form';

function Feedback({ state }: { state: AgencyAdminState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="mt-sm text-body-md text-error">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="mt-sm text-body-md text-primary">
          {state.message}
        </p>
      )}
      {/*
        Parola BİR KEZ gösteriliyor ve bir daha alınamıyor: veritabanında
        yalnızca özeti var. E-postayla göndermek daha kolay olurdu ama parola
        o zaman üçüncü bir sunucudan geçer ve orada kalırdı.
      */}
      {state.password && (
        <div className="mt-sm rounded-lg border border-outline-variant bg-surface-container p-3">
          <p className="text-label-sm text-on-surface-variant">
            Parola — bir daha gösterilmeyecek:
          </p>
          <p className="font-mono text-headline-sm text-on-surface">{state.password}</p>
        </div>
      )}
    </>
  );
}

export function CreateAgencyForm() {
  const [state, action, pending] = useActionState<AgencyAdminState, FormData>(
    createAgencyAction,
    {}
  );

  return (
    <form action={action}>
      <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
        <div>
          <label htmlFor="agency-name" className={LABEL}>
            Acente adı
          </label>
          <input
            id="agency-name"
            name="name"
            type="text"
            required
            minLength={2}
            placeholder="Marina Otel"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="agency-email" className={LABEL}>
            İletişim e-postası
          </label>
          <input id="agency-email" name="contactEmail" type="email" className={FIELD} />
        </div>
        <div>
          <label htmlFor="agency-phone" className={LABEL}>
            Telefon
          </label>
          <input id="agency-phone" name="phone" type="tel" className={FIELD} />
        </div>
      </div>

      <Feedback state={state} />

      <button type="submit" disabled={pending} className={`mt-md ${PRIMARY_BUTTON}`}>
        {pending ? 'Açılıyor…' : 'Acente Aç'}
      </button>
    </form>
  );
}

export function CreateAgencyUserForm({ agencyId }: { agencyId: string }) {
  const [state, action, pending] = useActionState<AgencyAdminState, FormData>(
    createAgencyUserAction,
    {}
  );

  return (
    <form action={action}>
      <input type="hidden" name="agencyId" value={agencyId} />

      <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
        <div>
          <label htmlFor={`user-name-${agencyId}`} className={LABEL}>
            Ad soyad
          </label>
          <input
            id={`user-name-${agencyId}`}
            name="name"
            type="text"
            required
            minLength={2}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={`user-email-${agencyId}`} className={LABEL}>
            E-posta
          </label>
          <input
            id={`user-email-${agencyId}`}
            name="email"
            type="email"
            required
            className={FIELD}
          />
        </div>
      </div>

      <Feedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="mt-sm rounded-lg border border-outline-variant px-4 py-2 text-label-bold text-on-surface-variant disabled:opacity-60"
      >
        {pending ? 'Açılıyor…' : 'Hesap Ekle'}
      </button>
    </form>
  );
}

export function AgencyStatusButton({
  agencyId,
  suspended,
}: {
  agencyId: string;
  suspended: boolean;
}) {
  const [state, action, pending] = useActionState<AgencyAdminState, FormData>(
    setAgencyStatusAction,
    {}
  );

  if (state.message) {
    return <span className="text-label-sm text-on-surface-variant">{state.message}</span>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="agencyId" value={agencyId} />
      <input type="hidden" name="suspend" value={suspended ? '0' : '1'} />
      <button
        type="submit"
        disabled={pending}
        className="text-label-bold text-on-surface-variant hover:underline disabled:opacity-50"
      >
        {pending ? '…' : suspended ? 'Yeniden aç' : 'Askıya al'}
      </button>
      {state.error && <span className="ml-2 text-label-sm text-error">{state.error}</span>}
    </form>
  );
}

export function AgencyUserStatusButton({
  userId,
  suspended,
}: {
  userId: string;
  suspended: boolean;
}) {
  const [state, action, pending] = useActionState<AgencyAdminState, FormData>(
    setAgencyUserStatusAction,
    {}
  );

  if (state.message) {
    return <span className="text-label-sm text-on-surface-variant">{state.message}</span>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="suspend" value={suspended ? '0' : '1'} />
      <button
        type="submit"
        disabled={pending}
        className="text-label-bold text-on-surface-variant hover:underline disabled:opacity-50"
      >
        {pending ? '…' : suspended ? 'Yeniden aç' : 'Askıya al'}
      </button>
      {state.error && <span className="ml-2 text-label-sm text-error">{state.error}</span>}
    </form>
  );
}
