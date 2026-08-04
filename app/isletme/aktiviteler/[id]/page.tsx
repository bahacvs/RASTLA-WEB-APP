import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { OperatorNav } from '@/components/OperatorNav';
import { ActivityForm } from '../ActivityForm';
import { getOperatorId } from '@/lib/session';
import { getOperator } from '@/lib/operators';
import { getActivityById } from '@/lib/db/activities';

export const metadata: Metadata = {
  title: 'Aktiviteyi Düzenle',
  robots: { index: false, follow: false },
};

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const operatorId = await getOperatorId();
  if (!operatorId) redirect('/isletme');

  const operator = getOperator(operatorId);
  if (!operator) redirect('/isletme');

  const { id } = await params;
  const activity = getActivityById(id);
  // Başka bir işletmenin aktivitesi hiç var olmamış gibi davranır.
  if (!activity || activity.operatorId !== operatorId) notFound();

  return (
    <div className="min-h-screen">
      <OperatorNav operatorName={operator.name} />
      <main className="mx-auto max-w-[48rem] px-container-margin py-lg">
        <div className="mb-lg flex items-center justify-between gap-4">
          <h1 className="text-headline-md text-on-background">{activity.title}</h1>
          <Link
            href={`/isletme/aktiviteler/${activity.id}/takvim`}
            className="rounded-lg border border-primary px-4 py-2 text-label-bold text-primary"
          >
            Takvim
          </Link>
        </div>
        <ActivityForm activity={activity} />
      </main>
    </div>
  );
}
