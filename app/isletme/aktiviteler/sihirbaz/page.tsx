import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { OperatorNav } from '@/components/OperatorNav';
import { requireOperatorPage } from '@/lib/auth';
import { getActivityById } from '@/lib/db/activities';
import { listImages } from '@/lib/db/activity-images';
import { publishChecklist } from '@/app/actions/activity-wizard';
import { ImageManager } from '../[id]/ImageManager';
import { BasicsStep, LocationStep, PublishStep, ScheduleStep } from './StepForms';
import { CARD, GHOST_BUTTON } from '@/components/form';

export const metadata: Metadata = {
  title: 'Yeni Aktivite',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Aktivite oluşturma sihirbazı.
 *
 * Tek ekranlı form hâlâ duruyor (`/isletme/aktiviteler/yeni`) ve düzenleme
 * için doğru araç o. Sihirbaz **ilk kez** aktivite açan için: sıra belli
 * olsun, her adımda ne istendiği görünsün ve "Yayına Al neden kapalı"
 * sorusu ortadan kalksın.
 *
 * Adım adreste taşınıyor. Birinci adım veritabanına kayıt yazdığı için
 * istemci durumunda tutulamaz: tarayıcı yenilendiğinde kayıt ortada kalır ve
 * her denemede bir taslak daha birikirdi.
 */

const STEPS = [
  { id: 'temel', label: 'Temel bilgiler' },
  { id: 'konum', label: 'Konum' },
  { id: 'takvim', label: 'Takvim' },
  { id: 'gorseller', label: 'Görseller' },
  { id: 'ozet', label: 'Yayına al' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

function isStep(value: string): value is StepId {
  return STEPS.some((s) => s.id === value);
}

export default async function WizardPage({
  searchParams,
}: {
  searchParams: Promise<{ adim?: string; aktivite?: string }>;
}) {
  const session = await requireOperatorPage('aktivite.yonet');
  const params = await searchParams;

  const adim: StepId = params.adim && isStep(params.adim) ? params.adim : 'temel';
  const activityId = params.aktivite;

  // Aktivite gerektiren bir adıma kimliksiz gelinmişse başa dönülür; aksi
  // hâlde form boşa gönderim yapar ve kullanıcı sebebini anlamaz.
  if (adim !== 'temel' && !activityId) redirect('/isletme/aktiviteler/sihirbaz');

  const activity = activityId ? await getActivityById(activityId) : null;
  if (activityId && (!activity || activity.operatorId !== session.operator.id)) notFound();

  const index = STEPS.findIndex((s) => s.id === adim);
  const check = activity && adim === 'ozet' ? await publishChecklist(activity.id) : null;

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />

      <main className="mx-auto flex max-w-[52rem] flex-col gap-lg px-container-margin py-lg">
        <div>
          <h1 className="text-headline-md text-on-background">Yeni Aktivite</h1>
          <p className="text-body-md text-on-surface-variant">
            {STEPS.length} adım. Her adım kaydedilir; yarıda bırakıp sonra devam edebilirsiniz.
          </p>
        </div>

        {/* İlerleme */}
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => {
            const done = i < index;
            const current = i === index;
            const reachable = activity !== null && i <= index;

            const chip = (
              <span
                className={`flex items-center gap-2 rounded-full px-3 py-2 text-label-bold ${
                  current
                    ? 'bg-primary text-on-primary'
                    : done
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'border border-outline-variant text-on-surface-variant'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-label-sm ${
                    current ? 'bg-on-primary text-primary' : 'bg-surface-container text-on-surface'
                  }`}
                >
                  {i + 1}
                </span>
                {s.label}
              </span>
            );

            // Tamamlanmış adımlara dönülebiliyor; ilerideki adımlara
            // atlanamıyor — atlanan adımın verisi olmadan sonraki adım
            // anlamsız olurdu.
            return (
              <li key={s.id}>
                {reachable && !current ? (
                  <Link href={`/isletme/aktiviteler/sihirbaz?aktivite=${activity!.id}&adim=${s.id}`}>
                    {chip}
                  </Link>
                ) : (
                  chip
                )}
              </li>
            );
          })}
        </ol>

        <section className={CARD}>
          {adim === 'temel' && (
            <>
              <h2 className="mb-md text-headline-sm text-on-surface">Aktivite nedir?</h2>
              <BasicsStep
                activityId={activity?.id}
                defaults={
                  activity
                    ? {
                        title: activity.title,
                        category: activity.category,
                        priceTRY: activity.priceTRY,
                        durationMinutes: activity.durationMinutes,
                        capacityMode: activity.capacityMode,
                      }
                    : undefined
                }
              />
            </>
          )}

          {adim === 'konum' && activity && (
            <>
              <h2 className="mb-md text-headline-sm text-on-surface">Nerede yapılıyor?</h2>
              <LocationStep
                activityId={activity.id}
                defaults={{
                  location: activity.location,
                  lat: activity.lat,
                  lng: activity.lng,
                  description: activity.description,
                }}
              />
            </>
          )}

          {adim === 'takvim' && activity && (
            <>
              <h2 className="mb-xs text-headline-sm text-on-surface">Ne zaman müsaitsiniz?</h2>
              <p className="mb-md text-body-md text-on-surface-variant">
                Bir kural yazın, seanslar kendiliğinden üretilsin. Sonradan takvim ekranından
                değiştirebilirsiniz.
              </p>
              <ScheduleStep activityId={activity.id} category={activity.category} />
            </>
          )}

          {adim === 'gorseller' && activity && (
            <>
              <h2 className="mb-xs text-headline-sm text-on-surface">Fotoğraflar</h2>
              <p className="mb-md text-body-md text-on-surface-variant">
                En az bir görsel gerekiyor. İlk görsel kapak olur.
              </p>
              <ImageManager activityId={activity.id} images={await listImages(activity.id)} />

              <Link
                href={`/isletme/aktiviteler/sihirbaz?aktivite=${activity.id}&adim=ozet`}
                className={`mt-md inline-block ${GHOST_BUTTON}`}
              >
                Devam et
              </Link>
            </>
          )}

          {adim === 'ozet' && activity && check && (
            <>
              <h2 className="mb-md text-headline-sm text-on-surface">Yayına hazır mı?</h2>

              {check.ready ? (
                <p className="mb-md rounded-lg bg-secondary-container px-3 py-2 text-body-md text-on-secondary-container">
                  Her şey tamam. Yayına aldığınızda{' '}
                  {session.operator.verificationStatus === 'dogrulandi'
                    ? 'ilan hemen görünür olur.'
                    : 'ilan RASTLA incelemesine düşer; işletmeniz doğrulanmadığı için bu adım gerekiyor.'}
                </p>
              ) : (
                <div className="mb-md rounded-lg bg-tertiary-container px-3 py-2 text-body-md text-on-tertiary-container">
                  <p className="mb-1 font-semibold">Şunlar eksik:</p>
                  <ul className="list-disc pl-5">
                    {check.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}

              <dl className="mb-md grid grid-cols-2 gap-2 text-body-md sm:grid-cols-4">
                <Field label="Ad" value={activity.title} />
                <Field label="Fiyat" value={`${activity.priceTRY} TL`} />
                <Field label="Süre" value={activity.durationLabel} />
                <Field label="Konum" value={activity.location || '—'} />
              </dl>

              <PublishStep activityId={activity.id} missing={check.missing} />
            </>
          )}
        </section>

        <Link href="/isletme/aktiviteler" className="text-label-bold text-on-surface-variant">
          Sihirbazdan çık — taslak kaydedildi
        </Link>
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
