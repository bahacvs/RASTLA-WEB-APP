import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OperatorNav } from '@/components/OperatorNav';
import { currentOperator } from '@/lib/auth';
import { listOperatorUsers } from '@/lib/db/operators';
import { AddMemberForm, ChangeOwnPasswordForm, MemberControls } from './TeamControls';

export const metadata: Metadata = {
  title: 'Ekip',
  robots: { index: false, follow: false },
};

export default async function TeamPage() {
  const session = await currentOperator();
  if (!session) redirect('/isletme');
  if (session.user.role !== 'owner') redirect('/isletme/tara');

  const members = await listOperatorUsers(session.operator.id);

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
                    {member.role === 'owner' ? 'Sahip' : 'Personel'}
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

        <section>
          <h2 className="mb-sm text-headline-sm text-on-background">Kendi parolanızı değiştirin</h2>
          <ChangeOwnPasswordForm />
        </section>
      </main>
    </div>
  );
}
