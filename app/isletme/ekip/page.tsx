import type { Metadata } from 'next';
import { OperatorNav } from '@/components/OperatorNav';
import { ROLE_LABELS } from '@/lib/permissions';
import { requireOperatorPage } from '@/lib/auth';
import { listOperatorUsers } from '@/lib/db/operators';
import { listGuestAccess } from '@/lib/db/memberships';
import { AddMemberForm, ChangeOwnPasswordForm, MemberControls } from './TeamControls';
import { GrantAccessForm, RevokeAccessButton } from './GuestAccess';

export const metadata: Metadata = {
  title: 'Ekip',
  robots: { index: false, follow: false },
};

export default async function TeamPage() {
  const session = await requireOperatorPage('ekip.yonet');

  const members = await listOperatorUsers(session.operator.id);
  const guests = await listGuestAccess(session.operator.id);

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />

      <main className="mx-auto max-w-[48rem] px-container-margin py-lg">
        <h1 className="mb-xs text-headline-md text-on-background">Ekip</h1>
        <p className="mb-lg text-body-md text-on-surface-variant">
          Her personelin kendi hesabı olur. Bilet onayı geri alınamayan bir işlemdir; kimin
          onayladığı ancak hesaplar kişiye özelse kayda geçer. Parola paylaşmayın.
        </p>

        <ul className="mb-lg flex flex-col gap-sm">
          {members.map((member) => (
            <li
              key={member.id}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
            >
              <div className="mb-sm flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body-lg font-semibold text-on-surface">
                    {member.name}
                    {member.id === session.user.id && (
                      <span className="ml-2 text-label-sm font-normal text-on-surface-variant">
                        (siz)
                      </span>
                    )}
                  </p>
                  <p className="truncate text-body-md text-on-surface-variant">{member.email}</p>
                  {member.phone && (
                    <p className="truncate text-label-sm text-on-surface-variant">
                      {member.phone}
                    </p>
                  )}
                  <p className="mt-1 text-label-sm text-on-surface-variant">
                    {member.lastLoginAt
                      ? `Son giriş: ${new Date(member.lastLoginAt).toLocaleString('tr-TR')}`
                      : 'Henüz giriş yapmadı'}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full bg-secondary-container px-2 py-1 text-label-bold text-on-secondary-container">
                    {ROLE_LABELS[member.role]}
                  </span>
                  {member.status === 'suspended' && (
                    <span className="rounded-full bg-error-container px-2 py-1 text-label-bold text-on-error-container">
                      Askıda
                    </span>
                  )}
                </div>
              </div>

              <MemberControls
                userId={member.id}
                name={member.name}
                status={member.status}
                isSelf={member.id === session.user.id}
                hasPhone={Boolean(member.phone)}
              />
            </li>
          ))}
        </ul>

        <section className="mb-lg">
          <h2 className="mb-sm text-headline-sm text-on-background">Ekibe kişi ekle</h2>
          <AddMemberForm />
        </section>

        <section className="mb-lg">
          <h2 className="mb-xs text-headline-sm text-on-background">Başka işletmeden erişim</h2>
          <p className="mb-sm text-body-md text-on-surface-variant">
            Zaten RASTLA hesabı olan birine bu işletmeye giriş hakkı verir. Yeni hesap açmaz,
            parola üretmez — kişi kendi parolasıyla girip üst çubuktan bu işletmeye geçer. Rolü
            burada ayrıca seçiyorsunuz: kendi işletmesinde sahip olması, burada da sahip olacağı
            anlamına gelmez.
          </p>

          {guests.length > 0 && (
            <ul className="mb-md flex flex-col gap-sm">
              {guests.map((guest) => (
                <li
                  key={guest.operatorUserId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body-md text-on-surface">{guest.name}</p>
                    <p className="truncate text-label-sm text-on-surface-variant">
                      {guest.email} · {ROLE_LABELS[guest.role]}
                    </p>
                  </div>
                  <RevokeAccessButton operatorUserId={guest.operatorUserId} name={guest.name} />
                </li>
              ))}
            </ul>
          )}

          <GrantAccessForm />
        </section>

        <section>
          <h2 className="mb-sm text-headline-sm text-on-background">Kendi parolanızı değiştirin</h2>
          <ChangeOwnPasswordForm />
        </section>
      </main>
    </div>
  );
}
