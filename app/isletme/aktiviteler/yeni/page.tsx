import type { Metadata } from 'next';
import { OperatorNav } from '@/components/OperatorNav';
import { ActivityForm } from '../ActivityForm';
import { requireOperatorPage } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Yeni Aktivite',
  robots: { index: false, follow: false },
};

export default async function NewActivityPage() {
  const session = await requireOperatorPage('aktivite.yonet');

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />
      <main className="mx-auto max-w-[48rem] px-container-margin py-lg">
        <h1 className="mb-lg text-headline-md text-on-background">Yeni Aktivite</h1>
        <ActivityForm />
      </main>
    </div>
  );
}
