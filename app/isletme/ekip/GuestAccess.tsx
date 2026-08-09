'use client';

import { useActionState } from 'react';
import {
  grantMembershipAction,
  revokeMembershipAction,
  type MembershipState,
} from '@/app/actions/membership';
import { OPERATOR_ROLES, ROLE_LABELS, type OperatorRole } from '@/lib/permissions';
import { FIELD, LABEL } from '@/components/form';

function Feedback({ state }: { state: MembershipState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-sm text-body-md text-error">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="mt-sm text-body-md text-primary">
        {state.message}
      </p>
    );
  }
  return null;
}

/**
 * Başka bir işletmenin hesabına BU işletmeye erişim verir.
 *
 * "Ekibe kişi ekle"den ayrı tutuluyor çünkü ikisi farklı şeyler: orası yeni
 * bir hesap AÇIYOR (e-posta + parola), burası var olan bir hesaba kapı
 * açıyor. Aynı forma sıkıştırılsalardı, ortağının hesabına erişim vermek
 * isteyen kişi ona ikinci bir parola üretmiş olurdu.
 *
 * Rol burada ayrıca seçiliyor: kişi kendi işletmesinde sahip olsa da burada
 * yalnızca saha personeli olabilir.
 */
export function GrantAccessForm() {
  const [state, action, pending] = useActionState<MembershipState, FormData>(
    grantMembershipAction,
    {}
  );

  return (
    <form action={action}>
      <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="guest-email" className={LABEL}>
            Hesabın e-postası
          </label>
          <input
            id="guest-email"
            name="email"
            type="email"
            required
            placeholder="ortak@ornek.com"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="guest-role" className={LABEL}>
            Bu işletmedeki rolü
          </label>
          <select id="guest-role" name="role" defaultValue="staff" className={FIELD}>
            {OPERATOR_ROLES.map((role: OperatorRole) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Feedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="mt-md rounded-lg bg-primary px-4 py-3 text-label-bold text-on-primary disabled:opacity-60"
      >
        {pending ? 'Veriliyor…' : 'Erişim Ver'}
      </button>
    </form>
  );
}

export function RevokeAccessButton({ operatorUserId, name }: { operatorUserId: string; name: string }) {
  const [state, action, pending] = useActionState<MembershipState, FormData>(
    revokeMembershipAction,
    {}
  );

  if (state.message) {
    return <span className="text-label-sm text-on-surface-variant">{state.message}</span>;
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="operatorUserId" value={operatorUserId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`${name} erişimini kaldır`}
        className="text-label-bold text-on-surface-variant hover:underline disabled:opacity-50"
      >
        {pending ? '…' : 'Erişimi kaldır'}
      </button>
      {state.error && <span className="text-label-sm text-error">{state.error}</span>}
    </form>
  );
}
