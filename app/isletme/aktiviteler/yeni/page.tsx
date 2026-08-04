import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OperatorNav } from '@/components/OperatorNav';
import { ActivityForm } from '../ActivityForm';
import { getOperatorId } from '@/lib/session';
import { getOperator } from '@/lib/operators';

export const metadata: Metadata = {
  title: 'Yeni Aktivite',
  robots: { index: false, follow: false },
};

export default async function NewActivityPage() {
  const operatorId = await getOperatorId();
  if (!operatorId) redirect('/isletme');

  const operator = getOperator(operatorId);
  if (!operator) redirect('/isletme');

  return (
    <div className="min-h-screen">
      <OperatorNav operatorName={operator.name} />
      <main className="mx-auto max-w-[48rem] px-container-margin py-lg">
        <h1 className="mb-lg text-headline-md text-on-background">Yeni Aktivite</h1>
        <ActivityForm />
      </main>
    </div>
  );
}
