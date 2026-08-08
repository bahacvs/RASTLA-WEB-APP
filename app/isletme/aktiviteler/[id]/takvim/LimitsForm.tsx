'use client';

import { useActionState } from 'react';
import { saveLimitsAction, type LimitsFormState } from '@/app/actions/activity';

const FIELD =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none';
const LABEL = 'mb-1 block text-label-bold text-on-surface-variant';

/**
 * Operasyon sınırları.
 *
 * Takvim kuralından ayrı bir form: kural bir tercihtir ("sabah 8'den akşam
 * 6'ya çalışırım"), bunlar aktivitenin fiziksel gerçeğidir ("3 jet skim var,
 * her biri 2 kişilik"). Aynı forma sıkıştırılsalardı saati değiştirmek
 * isteyen kişi araç sayısını da yeniden girerdi.
 */
export function LimitsForm({
  activityId,
  minParticipants,
  bookingCutoffMinutes,
  prepMinutes,
  pool,
}: {
  activityId: string;
  minParticipants: number;
  bookingCutoffMinutes: number;
  prepMinutes: number;
  pool: { name: string; unitCount: number; capacityPerUnit: number } | null;
}) {
  const [state, action, pending] = useActionState<LimitsFormState, FormData>(saveLimitsAction, {});

  return (
    <form
      action={action}
      className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
    >
      <input type="hidden" name="activityId" value={activityId} />

      <h2 className="mb-xs text-headline-sm text-on-surface">Operasyon sınırları</h2>
      <p className="mb-md text-body-md text-on-surface-variant">
        Bu ayarlar hem RASTLA rezervasyonlarına hem elle eklediğiniz kayıtlara uygulanır.
      </p>

      <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
        <div>
          <label htmlFor="minParticipants" className={LABEL}>
            En az katılımcı
          </label>
          <input
            id="minParticipants"
            name="minParticipants"
            type="number"
            min={1}
            defaultValue={minParticipants}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="bookingCutoffMinutes" className={LABEL}>
            Son rezervasyon (dk önce)
          </label>
          <input
            id="bookingCutoffMinutes"
            name="bookingCutoffMinutes"
            type="number"
            min={0}
            defaultValue={bookingCutoffMinutes}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="prepMinutes" className={LABEL}>
            Hazırlık payı (dk)
          </label>
          <input
            id="prepMinutes"
            name="prepMinutes"
            type="number"
            min={0}
            defaultValue={prepMinutes}
            className={FIELD}
          />
        </div>
      </div>

      <div className="mt-md rounded-lg border border-outline-variant/60 bg-surface p-sm">
        <p className="mb-xs text-label-bold text-on-surface">Ekipman havuzu</p>
        <p className="mb-sm text-body-md text-on-surface-variant">
          Asıl sınır araç sayısıysa burayı doldurun. Boş bırakırsanız yalnızca kişi kapasitesi
          geçerli olur.
        </p>

        <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
          <div>
            <label htmlFor="poolName" className={LABEL}>
              Ekipman adı
            </label>
            <input
              id="poolName"
              name="poolName"
              type="text"
              defaultValue={pool?.name ?? ''}
              placeholder="Jet ski"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="unitCount" className={LABEL}>
              Adet
            </label>
            <input
              id="unitCount"
              name="unitCount"
              type="number"
              min={1}
              defaultValue={pool?.unitCount ?? 1}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="capacityPerUnit" className={LABEL}>
              Araç başına kişi
            </label>
            <input
              id="capacityPerUnit"
              name="capacityPerUnit"
              type="number"
              min={1}
              defaultValue={pool?.capacityPerUnit ?? 1}
              className={FIELD}
            />
          </div>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="mt-sm text-body-md text-error">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="mt-sm text-body-md text-primary">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-md rounded-lg bg-primary px-4 py-3 text-label-bold text-on-primary transition-transform active:scale-95 disabled:opacity-60"
      >
        {pending ? 'Kaydediliyor…' : 'Sınırları Kaydet'}
      </button>
    </form>
  );
}
