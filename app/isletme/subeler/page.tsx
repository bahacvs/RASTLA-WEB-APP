import type { Metadata } from 'next';
import { OperatorNav } from '@/components/OperatorNav';
import { requireOperatorPage } from '@/lib/auth';
import { listBranches } from '@/lib/db/branches';
import { listActivitiesForOperator } from '@/lib/db/activities';
import { CARD } from '@/components/form';
import { BranchForm, DeleteBranchButton } from './BranchForms';
import { ActivityBranchForm } from './ActivityBranchForm';

export const metadata: Metadata = {
  title: 'Şubeler',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Şubeler — aynı işletmenin lokasyonları.
 *
 * Ekran iki soruyu cevaplıyor: hangi lokasyonlarım var, ve hangi ilan
 * hangisinde yapılıyor. İkisi aynı sayfada çünkü ikincisi olmadan birincisi
 * hiçbir işe yaramıyor: şube tanımlayıp ilanları bağlamayan bir işletmenin
 * süzgeci hep boş liste gösterirdi.
 */
export default async function BranchesPage() {
  const session = await requireOperatorPage('takvim.yonet');

  const branches = await listBranches(session.operator.id);
  const activities = await listActivitiesForOperator(session.operator.id);

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />

      <main className="mx-auto flex max-w-[52rem] flex-col gap-lg px-container-margin py-lg">
        <div>
          <h1 className="text-headline-md text-on-background">Şubeler</h1>
          <p className="text-body-md text-on-surface-variant">
            Aynı işletmenin farklı lokasyonları. Bugün ve Rezervasyonlar ekranlarında şubeye göre
            süzebilirsiniz.
          </p>
        </div>

        {/*
          Sınır açıkça yazılıyor. Şube kırılımı raporlama içindir; ayrı IBAN
          gereken bir şube aslında ayrı bir işletmedir ve o durumda işletme
          seçicisiyle erişilir. Bunu söylememek, hak edişin şubeye göre
          bölüneceği beklentisini yaratırdı.
        */}
        <p className="rounded-xl border border-outline-variant bg-surface-container p-md text-body-md text-on-surface-variant">
          <strong className="text-on-surface">Hak ediş ve IBAN işletme düzeyinde kalır.</strong>{' '}
          Şube yalnızca operasyonu ayırır: hangi iskelede kimin geleceğini görmek için. Ayrı banka
          hesabı gereken bir lokasyon ayrı bir işletme olarak açılmalı; o zaman üst çubuktaki
          işletme seçicisinden geçebilirsiniz.
        </p>

        <section className={CARD}>
          <h2 className="mb-md text-headline-sm text-on-surface">Yeni şube</h2>
          <BranchForm />
        </section>

        {branches.length > 0 && (
          <section className="flex flex-col gap-md">
            <h2 className="text-headline-sm text-on-surface">Tanımlı şubeler</h2>
            {branches.map((branch) => (
              <div key={branch.id} className={CARD}>
                <div className="mb-md flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body-lg font-semibold text-on-surface">{branch.name}</p>
                    {branch.address && (
                      <p className="text-body-md text-on-surface-variant">{branch.address}</p>
                    )}
                    <p className="text-label-sm text-on-surface-variant">
                      {activities.filter((a) => a.branchId === branch.id).length} ilan bağlı
                    </p>
                  </div>
                  <DeleteBranchButton id={branch.id} name={branch.name} />
                </div>
                <BranchForm branch={branch} />
              </div>
            ))}
          </section>
        )}

        {activities.length > 0 && (
          <section className={CARD}>
            <h2 className="mb-xs text-headline-sm text-on-surface">İlanların şubeleri</h2>
            <p className="mb-md text-body-md text-on-surface-variant">
              Şubesiz bir ilan hiçbir süzgeçte görünmez — yalnızca &quot;Tüm şubeler&quot;de.
            </p>

            <ul className="flex flex-col gap-sm">
              {activities.map((activity) => (
                <li
                  key={activity.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant p-3"
                >
                  <span className="min-w-0 text-body-md text-on-surface">{activity.title}</span>
                  <ActivityBranchForm
                    activityId={activity.id}
                    branchId={activity.branchId}
                    branches={branches.map((b) => ({ id: b.id, name: b.name }))}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
