import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ScanPanel } from './ScanPanel';
import { getOperatorId } from '@/lib/session';
import { getOperator } from '@/lib/operators';
import { operatorLogoutAction } from '@/app/actions/operator';

export const metadata: Metadata = {
  title: 'Bilet Okut',
  robots: { index: false, follow: false },
};

export default async function ScanPage() {
  const operatorId = await getOperatorId();
  if (!operatorId) redirect('/isletme');

  const operator = getOperator(operatorId);
  if (!operator) redirect('/isletme');

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between border-b border-surface-variant bg-surface px-container-margin">
        <div>
          <p className="text-label-sm text-on-surface-variant">İşletme</p>
          <p className="text-body-md font-semibold text-on-surface">{operator.name}</p>
        </div>
        <form action={operatorLogoutAction}>
          <button type="submit" className="text-label-bold text-on-surface-variant hover:underline">
            Çıkış
          </button>
        </form>
      </header>

      <main className="mx-auto max-w-[32rem] px-container-margin py-lg">
        <ScanPanel />
      </main>
    </div>
  );
}
