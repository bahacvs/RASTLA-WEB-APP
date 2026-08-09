import type { Metadata } from 'next';
import { PlatformNav } from '@/components/PlatformNav';
import { requirePlatformPage } from '@/lib/platform-auth';
import { listAgencies, listAgencyUsers } from '@/lib/db/agencies';
import { CARD } from '@/components/form';
import {
  AgencyStatusButton,
  AgencyUserStatusButton,
  CreateAgencyForm,
  CreateAgencyUserForm,
} from './AgencyControls';

export const metadata: Metadata = {
  title: 'Acenteler',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * RASTLA'nın acente yönetimi.
 *
 * Acente açmak ve askıya almak burada; acentenin kendi ekranı `/acente`.
 * İkisi ayrı oturum çerezi taşıyor ve bu panelde oturum açmış olmak `/acente`
 * için hiçbir şey ifade etmiyor.
 */
export default async function AgenciesPage() {
  const user = await requirePlatformPage('acente.yonet');

  const agencies = await listAgencies();
  const usersByAgency = new Map(
    await Promise.all(
      agencies.map(async (agency) => [agency.id, await listAgencyUsers(agency.id)] as const)
    )
  );

  return (
    <div className="min-h-screen">
      <PlatformNav user={user} />

      <main className="mx-auto flex max-w-[52rem] flex-col gap-lg px-container-margin py-lg">
        <div>
          <h1 className="text-headline-md text-on-background">Acenteler</h1>
          <p className="text-body-md text-on-surface-variant">
            Otel, tur şirketi, konsiyerj. Acente rezervasyonu kapasiteyi normal bir rezervasyon
            gibi tüketir ama <strong>komisyon doğurmaz</strong>; ücret tesiste tahsil edilir.
          </p>
        </div>

        <section className={CARD}>
          <h2 className="mb-md text-headline-sm text-on-surface">Yeni acente</h2>
          <CreateAgencyForm />
        </section>

        {agencies.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">Henüz acente yok.</p>
        ) : (
          <section className="flex flex-col gap-md">
            <h2 className="text-headline-sm text-on-surface">Tanımlı acenteler</h2>

            {agencies.map((agency) => {
              const users = usersByAgency.get(agency.id) ?? [];

              return (
                <div key={agency.id} className={CARD}>
                  <div className="mb-md flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-lg font-semibold text-on-surface">
                        {agency.name}
                        {agency.status === 'suspended' && (
                          <span className="ml-2 rounded-full bg-error-container px-2 py-1 text-label-bold text-on-error-container">
                            Askıda
                          </span>
                        )}
                      </p>
                      <p className="text-body-md text-on-surface-variant">
                        {agency.contactEmail ?? '—'}
                        {agency.phone ? ` · ${agency.phone}` : ''}
                      </p>
                    </div>
                    <AgencyStatusButton
                      agencyId={agency.id}
                      suspended={agency.status === 'suspended'}
                    />
                  </div>

                  {users.length > 0 && (
                    <ul className="mb-md flex flex-col gap-sm">
                      {users.map((agencyUser) => (
                        <li
                          key={agencyUser.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-body-md text-on-surface">
                              {agencyUser.name}
                              {agencyUser.status === 'suspended' && ' · askıda'}
                            </p>
                            <p className="truncate text-label-sm text-on-surface-variant">
                              {agencyUser.email} ·{' '}
                              {agencyUser.lastLoginAt
                                ? `son giriş ${new Date(agencyUser.lastLoginAt).toLocaleString('tr-TR')}`
                                : 'hiç girmedi'}
                            </p>
                          </div>
                          <AgencyUserStatusButton
                            userId={agencyUser.id}
                            suspended={agencyUser.status === 'suspended'}
                          />
                        </li>
                      ))}
                    </ul>
                  )}

                  <CreateAgencyUserForm agencyId={agency.id} />
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
