import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
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
          /*
            Kurulumda hiç hesap yokken de giriş formu göstermenin anlamı yok.
            Eskiden burada `npm run operator:create` yazıyordu; artık işletme
            kendi hesabını açabildiği için komut satırı tek yol değil ve
            sayfayı açan kişi çoğunlukla sunucuya erişimi olan biri de değil.
          */
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
            <p className="mb-sm text-body-md text-on-surface-variant">
              Henüz hesap yok. İlk işletme hesabını buradan açabilirsiniz.
            </p>
            <Link
              href="/isletme/basvuru"
              className="inline-block rounded-lg bg-primary px-4 py-3 text-label-bold text-on-primary"
            >
              İşletme Kaydı
            </Link>
          </div>
        )}

        {hasAccounts && (
          <p className="mt-lg text-center text-body-md text-on-surface-variant">
            Hesabınız yok mu?{' '}
            <Link href="/isletme/basvuru" className="text-primary underline">
              İşletme kaydı
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
