import type { Metadata } from 'next';
import Link from 'next/link';
import { OperatorNav } from '@/components/OperatorNav';
import { requireOperatorPage } from '@/lib/auth';
import { listPayouts, payoutSummary, type PayoutStatus } from '@/lib/db/payouts';
import { listActivitiesForOperator } from '@/lib/db/activities';
import { formatPrice } from '@/lib/format';
import { TRANSFER_SCHEDULE_TEXT } from '@/lib/payouts-schedule';

export const metadata: Metadata = {
  title: 'Hak Ediş',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<PayoutStatus, string> = {
  held: 'Bekliyor',
  released: 'Hak edildi',
  reversed: 'Geri çevrildi',
};

const STATUS_CLASSES: Record<PayoutStatus, string> = {
  held: 'bg-tertiary-container text-on-tertiary-container',
  released: 'bg-primary text-on-primary',
  reversed: 'bg-error-container text-on-error-container',
};

/**
 * "Ne kadar kazandım, ne zaman alacağım?"
 *
 * Panelin cevaplaması gereken ikinci soru bu. Ayrımın merkezinde şu duruyor:
 * tahsil edilen para ile hak edilen para aynı şey değil. Ödemesi alınmış ama
 * hizmeti verilmemiş bir rezervasyonun tutarı "bekliyor"; bilet okutulunca
 * "hak edildi" oluyor. Tek bir "bakiye" gösterilseydi işletme, gelmeyen
 * müşterilerin parasını da kendi parası sanardı.
 */
export default async function FinancePage() {
  const session = await requireOperatorPage('finans.goruntule');

  const summary = await payoutSummary(session.operator.id);
  const lines = await listPayouts(session.operator.id, { limit: 200 });

  const activities = await listActivitiesForOperator(session.operator.id);
  const titleBySlug = new Map(activities.map((a) => [a.slug, a.title]));

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />

      <main className="mx-auto flex max-w-[64rem] flex-col gap-lg px-container-margin py-lg">
        <div>
          <h1 className="text-headline-md text-on-background">Hak Ediş</h1>
          <p className="text-body-md text-on-surface-variant">
            RASTLA üzerinden alınan ödemeler. Tesiste tahsil ettiğiniz manuel kayıtlar burada
            görünmez — o parayı zaten siz aldınız.
          </p>
        </div>

        <section className="grid grid-cols-2 gap-sm lg:grid-cols-4">
          <Tile label="Bekleyen bakiye" value={formatPrice(summary.heldTRY)} />
          <Tile label="Hak edilen" value={formatPrice(summary.releasedTRY)} tone="good" />
          <Tile label="RASTLA komisyonu" value={formatPrice(summary.commissionTRY)} />
          <Tile label="İade edilen" value={formatPrice(summary.refundedTRY)} />
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
          <h2 className="mb-xs text-headline-sm text-on-surface">Ödeme takvimi</h2>
          <p className="text-body-md text-on-surface-variant">{TRANSFER_SCHEDULE_TEXT}</p>
          <p className="mt-sm text-body-md text-on-surface-variant">
            Komisyon oranınız:{' '}
            <strong className="text-on-surface">
              %{(session.operator.commissionBp / 100).toFixed(2).replace(/\.?0+$/, '')}
            </strong>
          </p>
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
          <div className="mb-md flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-headline-sm text-on-surface">Mutabakat</h2>
            <Link
              href="/isletme/finans/rapor"
              prefetch={false}
              className="rounded-lg border border-outline-variant px-4 py-2 text-label-bold text-on-surface-variant hover:bg-surface-container-low"
            >
              CSV indir
            </Link>
          </div>

          {lines.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">
              Henüz RASTLA üzerinden ödenmiş bir rezervasyon yok.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] border-collapse text-body-md">
                <thead>
                  <tr className="border-b border-outline-variant text-left text-label-bold text-on-surface-variant">
                    <th className="py-2 pr-3">Tarih</th>
                    <th className="py-2 pr-3">Aktivite</th>
                    <th className="py-2 pr-3">Bilet</th>
                    <th className="py-2 pr-3 text-right">Brüt</th>
                    <th className="py-2 pr-3 text-right">Komisyon</th>
                    <th className="py-2 pr-3 text-right">Net</th>
                    <th className="py-2">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-b border-surface-variant last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap text-on-surface">
                        {line.bookingDate} {line.bookingTime}
                      </td>
                      <td className="py-2 pr-3 text-on-surface-variant">
                        {titleBySlug.get(line.activitySlug) ?? line.activitySlug}
                      </td>
                      <td className="py-2 pr-3 font-mono text-on-surface-variant">
                        {line.bookingCode}
                      </td>
                      <td className="py-2 pr-3 text-right text-on-surface">
                        {formatPrice(line.grossTRY)}
                      </td>
                      <td className="py-2 pr-3 text-right text-on-surface-variant">
                        −{formatPrice(line.commissionTRY)}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold text-on-surface">
                        {formatPrice(line.netTRY)}
                      </td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-1 text-label-bold whitespace-nowrap ${STATUS_CLASSES[line.status]}`}
                        >
                          {STATUS_LABELS[line.status]}
                        </span>
                        {/*
                          Defterde ilerlemiş ama sağlayıcıya iletilememiş kayıt.
                          Gizlenmiyor: parası fiilen aktarılmamış tek durum bu ve
                          işletmenin bunu bizden önce görmesi gerekebilir.
                        */}
                        {line.failureReason && (
                          <p className="mt-1 text-label-sm text-error">{line.failureReason}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-body-md text-on-surface-variant">
          Bu ekran bir muhasebe programı değildir. Komisyon faturası ayrıca düzenlenir;
          rakamlar mutabakat içindir.
        </p>
      </main>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        tone === 'good'
          ? 'border-primary bg-surface-container-lowest text-on-surface'
          : 'border-outline-variant bg-surface-container-lowest text-on-surface'
      }`}
    >
      <p className="text-label-sm text-on-surface-variant">{label}</p>
      <p className="text-headline-sm font-semibold">{value}</p>
    </div>
  );
}
