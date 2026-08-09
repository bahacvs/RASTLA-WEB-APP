import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OperatorNav } from '@/components/OperatorNav';
import { ActivityForm } from '../ActivityForm';
import { requireOperatorPage } from '@/lib/auth';
import { getActivityById } from '@/lib/db/activities';
import { listImages } from '@/lib/db/activity-images';
import { ImageManager } from './ImageManager';
import { listLinks } from '@/lib/db/booking-links';
import { SOURCE_LABELS } from '@/lib/booking-sources';
import { SITE_URL } from '@/lib/site';
import { TicketQr } from '@/components/TicketQr';
import { CopyLinkButton, CreateLinkForm, ToggleLinkButton } from './LinkControls';

export const metadata: Metadata = {
  title: 'Aktiviteyi Düzenle',
  robots: { index: false, follow: false },
};

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperatorPage('aktivite.yonet');
  const operatorId = session.operator.id;

  const { id } = await params;
  const activity = await getActivityById(id);
  // Başka bir işletmenin aktivitesi hiç var olmamış gibi davranır.
  if (!activity || activity.operatorId !== operatorId) notFound();

  const links = await listLinks(activity.id);

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

        <section className="mt-lg border-t border-outline-variant pt-lg">
          <h2 className="mb-xs text-headline-sm text-on-surface">Paylaşım linkleri</h2>
          <p className="mb-md text-body-md text-on-surface-variant">
            Bu linki Instagram profilinize, tabelanıza ya da WhatsApp yanıtınıza koyun. Buradan
            gelen rezervasyon <strong>aynı takvime</strong> düşer — telefonla gelen müşteriyi elle
            girmek zorunda kalmazsınız. Kanal başına ayrı link açarsanız hangisinin işe yaradığını
            görürsünüz.
          </p>

          {links.length > 0 && (
            <ul className="mb-lg flex flex-col gap-md">
              {links.map((link) => {
                const url = `${SITE_URL}/r/${link.code}`;

                return (
                  <li
                    key={link.id}
                    className={`rounded-xl border p-md ${
                      link.disabledAt
                        ? 'border-outline-variant bg-surface-container opacity-70'
                        : 'border-outline-variant bg-surface-container-lowest'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-md">
                      <div className="min-w-0 flex-1">
                        <p className="text-body-lg font-semibold text-on-surface">
                          {link.label}
                          {link.disabledAt && (
                            <span className="ml-2 text-label-sm font-normal">· kapalı</span>
                          )}
                        </p>
                        <p className="text-label-sm text-on-surface-variant">
                          {SOURCE_LABELS[link.source]} · bu linkten{' '}
                          <strong className="text-on-surface">{link.bookings}</strong> rezervasyon
                        </p>

                        <p className="mt-sm font-mono text-body-md break-all text-on-surface">
                          {url}
                        </p>

                        <div className="mt-sm flex flex-wrap items-center gap-3">
                          <CopyLinkButton url={url} />
                          <a
                            href={`/api/qr/${link.code}`}
                            className="rounded-lg border border-outline-variant px-3 py-1 text-label-bold text-on-surface-variant"
                          >
                            QR indir (PNG)
                          </a>
                          <ToggleLinkButton
                            id={link.id}
                            activityId={activity.id}
                            disabled={link.disabledAt !== null}
                          />
                        </div>
                      </div>

                      {/* QR sayfada da görünüyor: işletme telefonunu uzatıp
                          müşteriye okutabilsin diye. */}
                      <div className="shrink-0">
                        <TicketQr value={url} size={120} label={`${link.label} QR kodu`} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <CreateLinkForm activityId={activity.id} />
        </section>
      </main>
    </div>
  );
}
