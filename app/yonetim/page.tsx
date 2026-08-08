import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PlatformLoginForm } from './PlatformLoginForm';
import { currentPlatformUser } from '@/lib/platform-auth';
import { countPlatformUsers } from '@/lib/db/platform';

export const metadata: Metadata = {
  title: 'RASTLA Yönetim',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function PlatformLoginPage() {
  if (await currentPlatformUser()) redirect('/yonetim/isletmeler');

  const hasAccounts = (await countPlatformUsers()) > 0;

  return (
    <div className="flex min-h-screen items-center justify-center px-container-margin">
      <div className="w-full max-w-[24rem]">
        <h1 className="mb-xs text-headline-md text-on-background">RASTLA Yönetim</h1>
        <p className="mb-lg text-body-md text-on-surface-variant">
          İşletme doğrulama ve ilan incelemesi. Bu ekran işletme paneli değildir.
        </p>

        {hasAccounts ? (
          <PlatformLoginForm />
        ) : (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
            <p className="mb-sm text-body-md text-on-surface-variant">
              Henüz platform hesabı yok. Sunucuda ilk hesabı şu komutla açın:
            </p>
            <pre className="overflow-x-auto rounded-lg bg-surface-container p-3 font-mono text-label-sm text-on-surface">
              npm run platform:create
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
