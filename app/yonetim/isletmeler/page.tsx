import type { Metadata } from 'next';
import { PlatformNav } from '@/components/PlatformNav';
import { requirePlatformPage, platformCan } from '@/lib/platform-auth';
import { listOperators, VERIFICATION_LABELS } from '@/lib/db/operators';
import { payoutSummary } from '@/lib/db/payouts';
import { formatPrice } from '@/lib/format';
import { OperatorControls } from './OperatorControls';

export const metadata: Metadata = {
  title: 'İşletmeler',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * İşletme listesi — doğrulama, komisyon ve hak ediş durumu bir arada.
 *
 * Üçünün aynı satırda olması kasıtlı: bir işletme hakkında karar verirken
 * (örneğin hak edişi durdururken) doğrulama durumunun ve bekleyen bakiyenin
 * görülmesi gerekiyor. Ayrı ekranlara bölünseydi karar, eksik bilgiyle
 * verilirdi.
 */
export default async function OperatorsPage() {
  const user = await requirePlatformPage('isletme.goruntule');
  const operators = await listOperators();

  const summaries = new Map<string, Awaited<ReturnType<typeof payoutSummary>>>();
  for (const operator of operators) {
    summaries.set(operator.id, await payoutSummary(operator.id));
  }

  return (
    <div className="min-h-screen">
      <PlatformNav user={user} />

      <main className="mx-auto flex max-w-[64rem] flex-col gap-lg px-container-margin py-lg">
        <div>
          <h1 className="text-headline-md text-on-background">İşletmeler</h1>
          <p className="text-body-md text-on-surface-variant">
            {operators.length} işletme. &quot;Doğrulandı&quot; rozeti yalnızca doğrulanmış
            işletmelerin ilanlarında görünür.
          </p>
        </div>

        <ul className="flex flex-col gap-md">
          {operators.map((operator) => {
            const summary = summaries.get(operator.id)!;

            return (
              <li
                key={operator.id}
                className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
              >
                <div className="mb-sm flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body-md font-semibold text-on-surface">{operator.name}</p>
                    <p className="text-label-sm text-on-surface-variant">{operator.id}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      label={VERIFICATION_LABELS[operator.verificationStatus]}
                      tone={operator.verificationStatus === 'dogrulandi' ? 'good' : 'neutral'}
                    />
                    <Badge label={`%${(operator.commissionBp / 100).toFixed(2).replace(/\.?0+$/, '')}`} />
                    {operator.payoutsSuspended && <Badge label="Hak ediş durduruldu" tone="bad" />}
                    {!operator.submerchantKey && <Badge label="Ödeme kapalı" tone="warn" />}
                  </div>
                </div>

                <dl className="mb-md grid grid-cols-2 gap-2 text-body-md sm:grid-cols-4">
                  <Stat label="Bekleyen" value={formatPrice(summary.heldTRY)} />
                  <Stat label="Hak edilen" value={formatPrice(summary.releasedTRY)} />
                  <Stat label="Komisyon" value={formatPrice(summary.commissionTRY)} />
                  <Stat label="İade" value={formatPrice(summary.refundedTRY)} />
                </dl>

                <OperatorControls
                  operatorId={operator.id}
                  verificationStatus={operator.verificationStatus}
                  commissionPercent={operator.commissionBp / 100}
                  payoutsSuspended={operator.payoutsSuspended}
                  mayVerify={platformCan(user, 'isletme.dogrula')}
                  maySetCommission={platformCan(user, 'komisyon.belirle')}
                  maySuspendPayouts={platformCan(user, 'hakedis.durdur')}
                />
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone?: 'good' | 'bad' | 'warn' | 'neutral' }) {
  const className =
    tone === 'good'
      ? 'bg-primary text-on-primary'
      : tone === 'bad'
        ? 'bg-error-container text-on-error-container'
        : tone === 'warn'
          ? 'bg-tertiary-container text-on-tertiary-container'
          : 'bg-surface-container text-on-surface-variant';

  return (
    <span className={`rounded-full px-2 py-1 text-label-bold whitespace-nowrap ${className}`}>
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label-sm text-on-surface-variant">{label}</dt>
      <dd className="font-semibold text-on-surface">{value}</dd>
    </div>
  );
}
