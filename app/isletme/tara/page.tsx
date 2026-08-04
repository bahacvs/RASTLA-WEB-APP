import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ScanPanel } from './ScanPanel';
import { currentOperator } from '@/lib/auth';
import { OperatorNav } from '@/components/OperatorNav';

export const metadata: Metadata = {
  title: 'Bilet Okut',
  robots: { index: false, follow: false },
};

export default async function ScanPage() {
  const session = await currentOperator();
  if (!session) redirect('/isletme');

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />

      <main className="mx-auto max-w-[32rem] px-container-margin py-lg">
        <ScanPanel />
      </main>
    </div>
  );
}
