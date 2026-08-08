'use client';

import { useActionState, useState } from 'react';
import {
  createManualBookingAction,
  slotsForManualBooking,
  type ManualBookingState,
} from '@/app/actions/manual-booking';
import { SOURCE_LABELS, type BookingSource } from '@/lib/booking-sources';
import type { Slot } from '@/lib/db/slots';

const FIELD =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none';
const LABEL = 'mb-1 block text-label-bold text-on-surface-variant';

/** Elle kayıtta anlamlı olan kanallar — "rastla" burada seçilemez. */
const SOURCES: BookingSource[] = ['phone', 'whatsapp', 'instagram', 'hotel', 'agency', 'manual'];

/**
 * Telefondaki müşteriyi 20 saniyede eklemek için.
 *
 * Alanlar bilinçli olarak az: aktivite, gün, saat, kişi, ad, telefon. Daha
 * fazlasını istemek, işletmenin bu formu kullanmak yerine deftere yazmasına
 * yol açardı — ve o defter, RASTLA'nın müsaitliğini yanlış gösteren şeyin ta
 * kendisi.
 */
export function ManualBookingForm({
  activities,
  today,
}: {
  activities: { id: string; title: string }[];
  today: string;
}) {
  const [state, action, pending] = useActionState<ManualBookingState, FormData>(
    createManualBookingAction,
    {}
  );

  const [activityId, setActivityId] = useState(activities[0]?.id ?? '');
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * Saatleri sunucudan çeker.
   *
   * Efekt içinde değil, seçim değiştiği anda çağrılıyor. Slot listesi
   * istemcide önbelleklenmiyor: doluluk anlık değişiyor ve eski bir listeden
   * seçim yapmak, dolu bir saate kayıt açmayı denemek olurdu.
   */
  async function loadSlots(nextActivityId: string, nextDate: string) {
    if (!nextActivityId) return;
    setLoading(true);
    try {
      const rows = await slotsForManualBooking(nextActivityId, nextDate);
      setSlots(rows.filter((s) => s.status === 'open' && s.remaining > 0));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      action={action}
      className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
    >
      <h2 className="mb-xs text-headline-sm text-on-surface">Elle rezervasyon ekle</h2>
      <p className="mb-md text-body-md text-on-surface-variant">
        Telefondan ya da WhatsApp&apos;tan gelen müşteri. Komisyon alınmaz; kayıt yalnızca
        takviminizin doğru kalması için.
      </p>

      <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
        <div>
          <label htmlFor="activityId" className={LABEL}>
            Aktivite
          </label>
          <select
            id="activityId"
            name="activityId"
            value={activityId}
            onChange={(e) => {
              setActivityId(e.target.value);
              void loadSlots(e.target.value, date);
            }}
            className={FIELD}
          >
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="date" className={LABEL}>
            Tarih
          </label>
          <input
            id="date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              void loadSlots(activityId, e.target.value);
            }}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="slotId" className={LABEL}>
            Saat
          </label>
          <select id="slotId" name="slotId" className={FIELD} disabled={loading}>
            {loading && <option>Yükleniyor…</option>}
            {!loading && slots.length === 0 && (
              <option value="">Saatleri getirmek için &quot;Saatleri Yükle&quot;ye basın</option>
            )}
            {!loading &&
              slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.time} — {s.remaining} kişilik yer
                  {s.remainingUnits !== null ? ` · ${s.remainingUnits} araç` : ''}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label htmlFor="people" className={LABEL}>
            Kişi sayısı
          </label>
          <input id="people" name="people" type="number" min={1} defaultValue={1} className={FIELD} />
        </div>

        <div>
          <label htmlFor="name" className={LABEL}>
            Ad soyad
          </label>
          <input id="name" name="name" type="text" className={FIELD} />
        </div>

        <div>
          <label htmlFor="phone" className={LABEL}>
            Telefon
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="05XX XXX XX XX"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="source" className={LABEL}>
            Nereden geldi
          </label>
          <select id="source" name="source" defaultValue="phone" className={FIELD}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-body-md text-on-surface">
            <input type="checkbox" name="paid" className="h-5 w-5" />
            Ücret tesiste tahsil edilecek
          </label>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="mt-sm text-body-md text-error">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="mt-sm text-body-md text-primary">
          {state.message} Bilet kodu: <strong>{state.code}</strong>
        </p>
      )}

      <button
        type="button"
        onClick={() => void loadSlots(activityId, date)}
        className="mt-md mr-sm rounded-lg border border-outline-variant px-4 py-3 text-label-bold text-on-surface-variant"
      >
        Saatleri Yükle
      </button>

      <button
        type="submit"
        disabled={pending || slots.length === 0}
        className="mt-md rounded-lg bg-primary px-4 py-3 text-label-bold text-on-primary transition-transform active:scale-95 disabled:opacity-60"
      >
        {pending ? 'Ekleniyor…' : 'Rezervasyonu Ekle'}
      </button>
    </form>
  );
}
