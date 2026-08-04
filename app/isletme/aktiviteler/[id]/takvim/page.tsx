import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { OperatorNav } from '@/components/OperatorNav';
import { Icon } from '@/components/Icon';
import { ScheduleForm } from './ScheduleForm';
import { currentOperator } from '@/lib/auth';
import { getActivityById } from '@/lib/db/activities';
import { listRules, listSlots, timesForRule } from '@/lib/db/slots';
import { toggleRuleAction, toggleSlotAction } from '@/app/actions/activity';

export const metadata: Metadata = {
  title: 'Takvim',
  robots: { index: false, follow: false },
};

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function weekdayLabel(mask: number): string {
  if (mask === 127) return 'Her gün';
  return WEEKDAYS.filter((_, i) => (mask & (1 << i)) !== 0).join(', ');
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ gun?: string }>;
}) {
  const session = await currentOperator();
  if (!session) redirect('/isletme');
  // Aktivite yönetimi sahibe ayrılmış; personel bilet ekranına döner.
  if (session.user.role !== 'owner') redirect('/isletme/tara');
  const operatorId = session.operator.id;

  const { id } = await params;
  const activity = getActivityById(id);
  if (!activity || activity.operatorId !== operatorId) notFound();

  const { gun } = await searchParams;
  const day = gun && /^\d{4}-\d{2}-\d{2}$/.test(gun) ? gun : isoDate(new Date());

  const rules = listRules(activity.id);
  const slots = listSlots(activity.id, day);

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />

      <main className="mx-auto flex max-w-[48rem] flex-col gap-lg px-container-margin py-lg">
        <div>
          <Link
            href="/isletme/aktiviteler"
            className="mb-sm inline-flex items-center gap-1 text-label-bold text-on-surface-variant"
          >
            <Icon name="arrow_back" size={18} />
            Aktiviteler
          </Link>
          <h1 className="text-headline-md text-on-background">{activity.title}</h1>
          <p className="text-body-md text-on-surface-variant">
            {activity.capacityMode === 'per_person'
              ? 'Kapasite kişi sayılıyor'
              : 'Kapasite rezervasyon sayılıyor'}
          </p>
        </div>

        <ScheduleForm activityId={activity.id} />

        {/* Tanımlı kurallar */}
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
          <h2 className="mb-md text-headline-sm text-on-surface">Tanımlı Kurallar</h2>

          {rules.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">
              Henüz kural yok. Yukarıdan ekleyin.
            </p>
          ) : (
            <ul className="flex flex-col gap-sm">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant p-3"
                >
                  <div className="min-w-0">
                    <p className="text-body-md font-semibold text-on-surface">
                      {rule.startTime}–{rule.endTime} · {rule.intervalMinutes} dk ·{' '}
                      {rule.capacity} kapasite
                    </p>
                    <p className="text-label-sm text-on-surface-variant">
                      {weekdayLabel(rule.weekdays)} · günde {timesForRule(rule).length} slot
                    </p>
                  </div>

                  <form action={toggleRuleAction}>
                    <input type="hidden" name="activityId" value={activity.id} />
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <input type="hidden" name="active" value={rule.active ? '0' : '1'} />
                    <button
                      type="submit"
                      className="shrink-0 rounded-lg border border-outline-variant px-3 py-2 text-label-bold text-on-surface-variant"
                    >
                      {rule.active ? 'Durdur' : 'Etkinleştir'}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Gün bazlı slotlar */}
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
          <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
            <h2 className="text-headline-sm text-on-surface">Günün Slotları</h2>
            <form className="flex items-center gap-2">
              <label htmlFor="gun" className="text-label-bold text-on-surface-variant">
                Gün
              </label>
              <input
                id="gun"
                name="gun"
                type="date"
                defaultValue={day}
                className="h-10 rounded-lg border border-outline-variant bg-surface px-2 text-body-md"
              />
              <button
                type="submit"
                className="rounded-lg border border-outline-variant px-3 py-2 text-label-bold text-on-surface-variant"
              >
                Göster
              </button>
            </form>
          </div>

          {slots.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">Bu gün için slot yok.</p>
          ) : (
            <div className="grid grid-cols-2 gap-sm sm:grid-cols-3">
              {slots.map((slot) => {
                const full = slot.remaining === 0 && slot.status === 'open';

                return (
                  <form key={slot.id} action={toggleSlotAction}>
                    <input type="hidden" name="activityId" value={activity.id} />
                    <input type="hidden" name="slotId" value={slot.id} />
                    <button
                      type="submit"
                      title={
                        slot.booked > 0
                          ? `${slot.booked} rezervasyon var — kapatmak müşterileri etkiler`
                          : slot.status === 'open'
                            ? 'Slotu kapat'
                            : 'Slotu aç'
                      }
                      className={`w-full rounded-lg border p-2 text-center transition-colors ${
                        slot.status === 'closed'
                          ? 'border-outline-variant bg-surface-container text-outline'
                          : full
                            ? 'border-error-container bg-error-container text-on-error-container'
                            : 'border-outline-variant text-on-surface hover:border-primary'
                      }`}
                    >
                      <span className="block text-body-md font-semibold">{slot.time}</span>
                      <span className="block text-label-sm">
                        {slot.status === 'closed'
                          ? 'Kapalı'
                          : `${slot.booked}/${slot.capacity} dolu`}
                      </span>
                    </button>
                  </form>
                );
              })}
            </div>
          )}

          <p className="mt-md text-label-sm text-on-surface-variant">
            Bir slota tıklayarak kapatabilir ya da yeniden açabilirsiniz. Rezervasyonu olan slotlar
            kural değişse bile silinmez.
          </p>
        </section>
      </main>
    </div>
  );
}
