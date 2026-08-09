import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AgencyLoginForm } from './AgencyLoginForm';
import { currentAgency } from '@/lib/agency-auth';
import { countAgencyUsers } from '@/lib/db/agencies';
import { CARD } from '@/components/form';

export const metadata: Metadata = {
  title: 'RASTLA Acente',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AgencyLoginPage() {
  if (await currentAgency()) redirect('/acente/ara');

  const hasAccounts = (await countAgencyUsers()) > 0;

  return (
    <div className="flex min-h-screen items-center justify-center px-container-margin">
      <div className="w-full max-w-[24rem]">
        <h1 className="mb-xs text-headline-md text-on-background">RASTLA Acente</h1>
        <p className="mb-lg text-body-md text-on-surface-variant">
          Otel ve tur şirketleri için. Misafiriniz adına yer tutun; ücret tesiste tahsil edilir.
          Bu ekran işletme paneli değildir.
        </p>

        {hasAccounts ? (
          <AgencyLoginForm />
        ) : (
          <div className={CARD}>
            <p className="mb-sm text-body-md text-on-surface-variant">
              Henüz acente hesabı yok. Sunucuda ilk hesabı şu komutla açın:
            </p>
            <pre className="overflow-x-auto rounded-lg bg-surface-container p-3 font-mono text-label-sm text-on-surface">
              npm run agency:create
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
