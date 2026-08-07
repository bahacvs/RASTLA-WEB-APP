import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { OperatorNav } from '@/components/OperatorNav';
import { ActivityForm } from '../ActivityForm';
import { currentOperator } from '@/lib/auth';
import { getActivityById } from '@/lib/db/activities';
import { listImages } from '@/lib/db/activity-images';
import { ImageManager } from './ImageManager';

export const metadata: Metadata = {
  title: 'Aktiviteyi Düzenle',
  robots: { index: false, follow: false },
};

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentOperator();
  if (!session) redirect('/isletme');
  // Aktivite yönetimi sahibe ayrılmış; personel bilet ekranına döner.
  if (session.user.role !== 'owner') redirect('/isletme/tara');
  const operatorId = session.operator.id;

  const { id } = await params;
  const activity = await getActivityById(id);
  // Başka bir işletmenin aktivitesi hiç var olmamış gibi davranır.
  if (!activity || activity.operatorId !== operatorId) notFound();

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />
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

        <div className="mt-lg border-t border-outline-variant pt-lg">
          <ImageManager activityId={activity.id} images={await listImages(activity.id)} />
        </div>
      </main>
    </div>
  );
}
