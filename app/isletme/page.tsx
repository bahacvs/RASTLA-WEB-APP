import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OperatorLoginForm } from './OperatorLoginForm';
import { currentOperator } from '@/lib/auth';
import { countOperatorUsers } from '@/lib/db/operators';

export const metadata: Metadata = {
  title: 'İşletme Girişi',
  robots: { index: false, follow: false },
};

export default async function OperatorLoginPage() {
  if (await currentOperator()) redirect('/isletme/tara');

  const hasAccounts = await countOperatorUsers() > 0;

  return (
    <div className="flex min-h-screen items-center justify-center px-container-margin">
      <div className="w-full max-w-[24rem]">
        <h1 className="mb-xs text-headline-md text-on-background">İşletme Girişi</h1>
        <p className="mb-lg text-body-md text-on-surface-variant">
          Bilet okutmak ve rezervasyonlarınızı görmek için kendi hesabınızla giriş yapın.
        </p>

        {hasAccounts ? (
          <OperatorLoginForm />
        ) : (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
            <p className="mb-sm text-body-md text-on-surface-variant">
              Henüz hesap oluşturulmamış. Sunucuda ilk sahip hesabını şu komutla açın:
            </p>
            <pre className="overflow-x-auto rounded-lg bg-surface-container p-3 font-mono text-label-sm text-on-surface">
              npm run operator:create
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
