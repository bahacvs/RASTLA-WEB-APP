import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OperatorLoginForm } from './OperatorLoginForm';
import { getOperatorId } from '@/lib/session';
import { OPERATORS, isOperatorLoginEnabled } from '@/lib/operators';

export const metadata: Metadata = {
  title: 'İşletme Girişi',
  robots: { index: false, follow: false },
};

export default async function OperatorLoginPage() {
  if (await getOperatorId()) redirect('/isletme/tara');

  const enabled = isOperatorLoginEnabled();

  return (
    <div className="flex min-h-screen items-center justify-center px-container-margin">
      <div className="w-full max-w-[24rem]">
        <h1 className="mb-xs text-headline-md text-on-background">İşletme Girişi</h1>
        <p className="mb-lg text-body-md text-on-surface-variant">
          Bilet okutmak için işletmenizi seçip erişim kodunu girin.
        </p>

        {enabled ? (
          <OperatorLoginForm operators={OPERATORS} />
        ) : (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
            <p className="text-body-md text-on-surface-variant">
              İşletme girişi yapılandırılmamış. Sunucuda{' '}
              <code className="font-mono text-label-sm">OPERATOR_ACCESS_CODES</code> tanımlanmalı.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
