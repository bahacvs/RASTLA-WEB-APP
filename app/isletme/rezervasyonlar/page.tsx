import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OperatorNav } from '@/components/OperatorNav';
import { Icon } from '@/components/Icon';
import { currentOperator } from '@/lib/auth';
import { listOperatorUsers } from '@/lib/db/operators';
import { listBookingsForOperator, type BookingStatus } from '@/lib/db/bookings';
import { displayContact, getUser } from '@/lib/db/users';
import { getActivityBySlug } from '@/lib/db/activities';
import { formatPrice } from '@/lib/format';
import { listSlots } from '@/lib/db/slots';
import { forecastsForOperator } from '@/lib/db/weather.mjs';
import { listBranches, validBranchFilter } from '@/lib/db/branches';
import { BranchFilter } from '@/components/BranchFilter';
import { WeatherStrip } from '@/components/WeatherStrip';
import { CancelBookingButton, CancelDayButton } from './CancelControls';
import { RescheduleControl, type SlotOption } from './RescheduleControl';

export const metadata: Metadata = {
  title: 'Rezervasyonlar',
  robots: { index: false, follow: false },
};

const STATUS: Record<BookingStatus, { label: string; className: string }> = {
  // Ayrı gösterilir ve ciroya sayılmaz: bu kayıt henüz para değil, bir
  // niyet. Personel de "bekliyor" görüp misafiri kabul etmemeli.
  pending_payment: {
    label: 'Ödeme bekliyor',
    className: 'bg-tertiary-container text-on-tertiary-container',
  },
  confirmed: { label: 'Bekliyor', className: 'bg-secondary-container text-on-secondary-container' },
  redeemed: { label: 'Kullanıldı', className: 'bg-surface-container-high text-on-surface-variant' },
  cancelled: { label: 'İptal', className: 'bg-error-container text-on-error-container' },
  expired: {
    label: 'Ödenmedi, düştü',
    className: 'bg-surface-container-high text-on-surface-variant',
  },
};

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export default async function OperatorBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gun?: string; sube?: string }>;
}) {
  const session = await currentOperator();
  if (!session) redirect('/isletme');
  const operatorId = session.operator.id;

  const { gun, sube } = await searchParams;
  const day = gun && /^\d{4}-\d{2}-\d{2}$/.test(gun) ? gun : isoDate(new Date());

  const branches = await listBranches(operatorId);
  const branchId = await validBranchFilter(sube, operatorId);

  const bookings = await listBookingsForOperator(operatorId, day, branchId);

  // Bileti onaylayan personelin adı. Kimliği ekranda göstermenin anlamı yok;
  // asıl mesele o kimliğin KAYITLI olması.
  const staff = new Map((await listOperatorUsers(operatorId)).map((u) => [u.id, u.name] as const));
  const redeemerName = (id: string | null) => (id && staff.get(id)) || 'Bilinmeyen hesap';

  // Aktivite ve misafir bilgisi JSX'ten ÖNCE toplanır: render sırasında veri
  // çekilemez. Aynı slug ya da aynı kişi birden çok rezervasyonda geçebildiği
  // için tekilleştirilir; aksi hâlde aynı satır defalarca sorgulanırdı.
  const activities = new Map(
    await Promise.all(
      [...new Set(bookings.map((b) => b.activitySlug))].map(
        async (slug) => [slug, await getActivityBySlug(slug)] as const
      )
    )
  );
  const guests_ = new Map(
    await Promise.all(
      [...new Set(bookings.map((b) => b.userId))].map(
        async (id) => [id, displayContact(await getUser(id))] as const
      )
    )
  );

  // Sayımlar yalnızca ödemesi tamam olan kayıtlar üzerinden. Bekleyen ödemeyi
  // ciroya yazmak, henüz tahsil edilmemiş parayı gün sonunda kasada varmış
  // gibi göstermek olurdu; süresi dolanı yazmak ise düpedüz yanlış.
  const counted = bookings.filter((b) => b.status === 'confirmed' || b.status === 'redeemed');
  const guests = counted.reduce((sum, b) => sum + b.adults + b.children, 0);
  const revenue = counted.reduce((sum, b) => sum + b.totalTRY, 0);

  const activeCount = bookings.filter((b) => b.status === 'confirmed').length;
  const pendingCount = bookings.filter((b) => b.status === 'pending_payment').length;

  // Taşıma seçenekleri: aynı aktivitenin seçili gün ve sonraki iki gündeki
  // AÇIK ve yer kalan slotları. Ufuk kasten dar — bir rezervasyonu bir hafta
  // sonraya taşımak taşıma değil, yeni bir plandır ve müşteriyle konuşulması
  // gerekir. Liste hazırlandıktan sonra yer başkasına gidebilir; son söz
  // `rescheduleBooking` içindeki koşullu UPDATE'te.
  const RESCHEDULE_HORIZON_DAYS = 3;
  const optionDays = Array.from({ length: RESCHEDULE_HORIZON_DAYS }, (_, offset) => {
    const d = new Date(`${day}T00:00:00`);
    d.setDate(d.getDate() + offset);
    return isoDate(d);
  });

  const slotOptions = new Map<string, SlotOption[]>();
  for (const [slug, activity] of activities) {
    if (!activity) continue;
    const options: SlotOption[] = [];
    for (const date of optionDays) {
      for (const slot of await listSlots(activity.id, date)) {
        if (slot.status !== 'open' || slot.remaining <= 0) continue;
        options.push({ id: slot.id, date, time: slot.time, remaining: slot.remaining });
      }
    }
    slotOptions.set(slug, options);
  }

  const forecasts = await forecastsForOperator(operatorId, day);
  const warnings = [...activities.values()]
    .filter((a) => a !== null)
    .map((a) => ({ activity: a, forecast: forecasts.get(a.id) ?? null }))
    .filter((row) => row.forecast !== null && row.forecast.verdict !== 'uygun');

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />

      <main className="mx-auto max-w-[48rem] px-container-margin py-lg">
        <div className="mb-lg flex flex-wrap items-center justify-between gap-sm">
          <h1 className="text-headline-md text-on-background">Rezervasyonlar</h1>
          <form className="flex items-center gap-2">
            {/* Gün değişirken şube süzgeci KORUNUYOR; aksi hâlde tarihi
                değiştiren kişi süzgecini sessizce kaybederdi. */}
            {branchId && <input type="hidden" name="sube" value={branchId} />}
            <input
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

        <div className="mb-lg">
          <BranchFilter
            branches={branches}
            activeId={branchId}
            basePath="/isletme/rezervasyonlar"
            extraParams={{ gun: day }}
          />
        </div>

        <div className="mb-lg grid grid-cols-3 gap-sm">
          <Stat label="Rezervasyon" value={String(bookings.length)} />
          <Stat label="Misafir" value={String(guests)} />
          <Stat label="Ciro" value={formatPrice(revenue)} />
        </div>

        {pendingCount > 0 && (
          <p className="mb-lg rounded-xl border border-outline-variant bg-surface-container p-md text-body-md text-on-surface-variant">
            <strong className="text-on-surface">{pendingCount} rezervasyonun ödemesi sürüyor.</strong>{' '}
            Yerleri tutuluyor ama biletleri henüz geçerli değil. Ödeme tamamlanmazsa kısa süre
            içinde düşer ve yerler tekrar satışa açılır.
          </p>
        )}

        {warnings.length > 0 && (
          <div className="mb-lg flex flex-col gap-sm">
            {warnings.map(({ activity, forecast }) => (
              <WeatherStrip key={activity.id} forecast={forecast} activityTitle={activity.title} />
            ))}
          </div>
        )}

        {activeCount > 0 && (
          <div className="mb-lg">
            <CancelDayButton date={day} count={activeCount} />
          </div>
        )}

        {bookings.length === 0 ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg text-center shadow-card">
            <Icon name="calendar_today" size={40} className="mb-sm text-outline" />
            <p className="text-headline-sm text-on-surface">Bu gün için rezervasyon yok</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-sm">
            {bookings.map((booking) => {
              const activity = activities.get(booking.activitySlug);
              const guest = guests_.get(booking.userId) ?? displayContact(null);
              const status = STATUS[booking.status];

              return (
                <li
                  key={booking.id}
                  className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
                >
                  <div className="mb-xs flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-lg font-semibold text-on-surface">
                        {booking.bookingTime} · {activity?.title}
                      </p>
                      <p className="text-body-md text-on-surface-variant">
                        {guest.name} · {guest.phone}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-label-bold ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="flex items-end justify-between border-t border-surface-variant pt-sm">
                    <span className="text-body-md text-on-surface-variant">
                      {booking.adults} yetişkin
                      {booking.children > 0 ? `, ${booking.children} çocuk` : ''}
                    </span>
                    <div className="text-right">
                      <span className="block font-mono text-label-sm text-outline">
                        {booking.code}
                      </span>
                      <span className="text-title-price text-on-surface">
                        {formatPrice(booking.totalTRY)}
                      </span>
                    </div>
                  </div>

                  {booking.status === 'confirmed' && (
                    <div className="mt-sm flex flex-wrap items-center justify-end gap-md">
                      {/*
                        Taşıma iptalin SOLUNDA: hava bozduğunda ilk denenmesi
                        gereken bu ve düğmelerin sırası hangisinin önce akla
                        geleceğini belirliyor.
                      */}
                      <RescheduleControl
                        code={booking.code}
                        options={(slotOptions.get(booking.activitySlug) ?? []).filter(
                          (option) => option.id !== booking.slotId
                        )}
                      />
                      <CancelBookingButton code={booking.code} />
                    </div>
                  )}

                  {booking.rescheduledAt && (
                    <p className="mt-sm text-label-sm text-on-surface-variant">
                      Bu rezervasyonun saati değiştirildi
                    </p>
                  )}

                  {booking.status === 'redeemed' && (
                    <p className="mt-sm text-label-sm text-on-surface-variant">
                      {redeemerName(booking.redeemedBy)} onayladı ·{' '}
                      {new Date(booking.redeemedAt!).toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}

                  {booking.cancelReason === 'weather' && (
                    <p className="mt-sm text-label-sm text-on-surface-variant">
                      Hava koşulu nedeniyle iptal edildi
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md text-center shadow-card">
      <p className="text-label-sm text-on-surface-variant">{label}</p>
      <p className="text-headline-sm text-on-surface">{value}</p>
    </div>
  );
}
