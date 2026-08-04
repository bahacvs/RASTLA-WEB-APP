import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OperatorNav } from '@/components/OperatorNav';
import { Icon } from '@/components/Icon';
import { currentOperator } from '@/lib/auth';
import { listActivitiesForOperator } from '@/lib/db/activities';
import { listRules } from '@/lib/db/slots';
import { formatPrice } from '@/lib/format';
import { CATEGORY_LABELS } from '@/lib/catalog';
import { toggleActivityStatusAction } from '@/app/actions/activity';

export const metadata: Metadata = {
  title: 'Aktiviteler',
  robots: { index: false, follow: false },
};

export default async function OperatorActivitiesPage() {
  const session = await currentOperator();
  if (!session) redirect('/isletme');
  // Aktivite yönetimi sahibe ayrılmış; personel bilet ekranına döner.
  if (session.user.role !== 'owner') redirect('/isletme/tara');
  const operatorId = session.operator.id;

  const activities = listActivitiesForOperator(operatorId);

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />

      <main className="mx-auto max-w-[48rem] px-container-margin py-lg">
        <div className="mb-lg flex items-center justify-between gap-4">
          <h1 className="text-headline-md text-on-background">Aktiviteler</h1>
          <Link
            href="/isletme/aktiviteler/yeni"
            className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-label-bold text-on-primary transition-transform active:scale-95"
          >
            <Icon name="add" size={18} />
            Yeni
          </Link>
        </div>

        {activities.length === 0 ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg text-center shadow-card">
            <p className="mb-sm text-headline-sm text-on-surface">Henüz aktivite yok</p>
            <p className="text-body-md text-on-surface-variant">
              İlk aktivitenizi ekleyin, ardından takvimini tanımlayın.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-md">
            {activities.map((activity) => {
              const rules = listRules(activity.id).filter((r) => r.active);
              const published = activity.status === 'published';

              return (
                <li
                  key={activity.id}
                  className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
                >
                  <div className="mb-sm flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-headline-sm text-on-surface">{activity.title}</h2>
                      <p className="text-body-md text-on-surface-variant">
                        {CATEGORY_LABELS[activity.category]} · {activity.durationLabel} ·{' '}
                        {formatPrice(activity.priceTRY)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-label-bold ${
                        published
                          ? 'bg-secondary-container text-on-secondary-container'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {published ? 'Yayında' : 'Taslak'}
                    </span>
                  </div>

                  <div className="mb-md flex flex-wrap gap-x-4 gap-y-1 text-body-md text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <Icon name="group" size={16} />
                      {activity.capacityMode === 'per_person'
                        ? 'Kapasite: kişi sayılır'
                        : 'Kapasite: rezervasyon sayılır'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="calendar_today" size={16} />
                      {rules.length > 0 ? `${rules.length} takvim kuralı` : 'Takvim tanımlı değil'}
                    </span>
                    {activity.lat === null && (
                      <span className="flex items-center gap-1 text-tertiary">
                        <Icon name="location_on" size={16} />
                        Konum girilmemiş
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-sm">
                    <Link
                      href={`/isletme/aktiviteler/${activity.id}`}
                      className="rounded-lg border border-outline-variant px-4 py-2 text-label-bold text-on-surface-variant"
                    >
                      Düzenle
                    </Link>
                    <Link
                      href={`/isletme/aktiviteler/${activity.id}/takvim`}
                      className="rounded-lg border border-primary px-4 py-2 text-label-bold text-primary"
                    >
                      Takvim
                    </Link>
                    <form action={toggleActivityStatusAction}>
                      <input type="hidden" name="id" value={activity.id} />
                      <button
                        type="submit"
                        disabled={rules.length === 0 && !published}
                        title={
                          rules.length === 0 && !published
                            ? 'Yayına almadan önce takvim tanımlayın'
                            : undefined
                        }
                        className="rounded-lg bg-primary px-4 py-2 text-label-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {published ? 'Yayından Kaldır' : 'Yayına Al'}
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
