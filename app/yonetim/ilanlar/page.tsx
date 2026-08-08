import type { Metadata } from 'next';
import { PlatformNav } from '@/components/PlatformNav';
import { requirePlatformPage } from '@/lib/platform-auth';
import { listPendingReview } from '@/lib/db/activities';
import { getOperator, VERIFICATION_LABELS } from '@/lib/db/operators';
import { CATEGORY_LABELS } from '@/lib/catalog';
import { formatPrice } from '@/lib/format';
import { reviewActivityAction } from '@/app/actions/platform';

export const metadata: Metadata = {
  title: 'İlan İncelemesi',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const BUTTON =
  'h-11 rounded-lg px-4 text-label-bold transition-transform active:scale-95';

/**
 * İnceleme kuyruğu.
 *
 * Buraya yalnızca **doğrulanmamış** işletmelerin ilanları düşüyor. Doğrulanmış
 * işletme doğrudan yayına çıkıyor — gerekçe `publishTargetFor` içinde yazılı.
 *
 * Reddedilen ilan silinmiyor, TASLAĞA dönüyor: işletme düzeltip yeniden
 * gönderebilmeli. Silmek, emeğini yok etmek ve neyin yanlış olduğunu
 * gösterecek metni de ortadan kaldırmak olurdu.
 */
export default async function ReviewPage() {
  const user = await requirePlatformPage('ilan.incele');
  const pending = await listPendingReview();

  const operators = new Map<string, Awaited<ReturnType<typeof getOperator>>>();
  for (const activity of pending) {
    if (!operators.has(activity.operatorId)) {
      operators.set(activity.operatorId, await getOperator(activity.operatorId));
    }
  }

  return (
    <div className="min-h-screen">
      <PlatformNav user={user} />

      <main className="mx-auto flex max-w-[60rem] flex-col gap-lg px-container-margin py-lg">
        <div>
          <h1 className="text-headline-md text-on-background">İlan İncelemesi</h1>
          <p className="text-body-md text-on-surface-variant">
            Doğrulanmamış işletmelerin yayına verdiği ilanlar. İncelemedeki ilan müşteriye
            görünmez.
          </p>
        </div>

        {pending.length === 0 ? (
          <p className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md text-body-md text-on-surface-variant shadow-card">
            Bekleyen ilan yok.
          </p>
        ) : (
          <ul className="flex flex-col gap-md">
            {pending.map((activity) => {
              const operator = operators.get(activity.operatorId);

              return (
                <li
                  key={activity.id}
                  className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
                >
                  <p className="text-body-md font-semibold text-on-surface">{activity.title}</p>
                  <p className="mb-sm text-body-md text-on-surface-variant">
                    {operator?.name ?? activity.operatorId} ·{' '}
                    {operator ? VERIFICATION_LABELS[operator.verificationStatus] : '—'}
                  </p>

                  <dl className="mb-sm grid grid-cols-2 gap-2 text-body-md sm:grid-cols-4">
                    <Field label="Kategori" value={CATEGORY_LABELS[activity.category]} />
                    <Field label="Fiyat" value={formatPrice(activity.priceTRY)} />
                    <Field label="Süre" value={activity.durationLabel} />
                    <Field label="Konum" value={activity.location} />
                  </dl>

                  {activity.description && (
                    <p className="mb-sm text-body-md text-on-surface-variant">
                      {activity.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <form action={reviewActivityAction}>
                      <input type="hidden" name="id" value={activity.id} />
                      <input type="hidden" name="approve" value="1" />
                      <button type="submit" className={`${BUTTON} bg-primary text-on-primary`}>
                        Onayla ve yayına al
                      </button>
                    </form>

                    <form action={reviewActivityAction}>
                      <input type="hidden" name="id" value={activity.id} />
                      <input type="hidden" name="approve" value="0" />
                      <button
                        type="submit"
                        className={`${BUTTON} border border-outline-variant text-on-surface-variant`}
                      >
                        Taslağa geri gönder
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label-sm text-on-surface-variant">{label}</dt>
      <dd className="text-on-surface">{value}</dd>
    </div>
  );
}
