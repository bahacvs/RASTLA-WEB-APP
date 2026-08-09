'use client';

import { useActionState } from 'react';
import {
  deleteGroupDiscountAction,
  deletePriceRuleAction,
  saveGroupDiscountAction,
  savePriceRuleAction,
  type PricingState,
} from '@/app/actions/pricing';
import { FIELD, GHOST_BUTTON, LABEL, PRIMARY_BUTTON, WEEKDAYS } from '@/components/form';

function Notice({ state }: { state: PricingState }) {
  if (!state.error && !state.message) return null;
  return (
    <p
      role="alert"
      className={`mt-sm rounded-lg px-3 py-2 text-body-md ${
        state.error
          ? 'bg-error-container text-on-error-container'
          : 'bg-surface-container text-on-surface-variant'
      }`}
    >
      {state.error ?? state.message}
    </p>
  );
}

export function PriceRuleForm({ activityId }: { activityId: string }) {
  const [state, action, pending] = useActionState<PricingState, FormData>(savePriceRuleAction, {});

  return (
    <form action={action} className="flex flex-col gap-sm">
      <input type="hidden" name="activityId" value={activityId} />

      <div className="grid gap-sm sm:grid-cols-2">
        <div>
          <label htmlFor="label" className={LABEL}>
            Kural adı
          </label>
          <input
            id="label"
            name="label"
            type="text"
            required
            minLength={2}
            placeholder="Cumartesi tarifesi"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="priceTRY" className={LABEL}>
            Kişi başı fiyat (TL)
          </label>
          <input
            id="priceTRY"
            name="priceTRY"
            type="number"
            required
            min={0}
            step={1}
            className={FIELD}
          />
        </div>
      </div>

      <fieldset>
        <legend className={LABEL}>Geçerli günler</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day, i) => (
            <label
              key={day}
              className="flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-2 text-body-md text-on-surface"
            >
              <input type="checkbox" name={`weekday${i}`} defaultChecked className="h-4 w-4" />
              {day}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-sm sm:grid-cols-2">
        <div>
          <label htmlFor="validFrom" className={LABEL}>
            Sezon başlangıcı
          </label>
          <input id="validFrom" name="validFrom" type="date" className={FIELD} />
        </div>
        <div>
          <label htmlFor="validUntil" className={LABEL}>
            Sezon bitişi
          </label>
          <input id="validUntil" name="validUntil" type="date" className={FIELD} />
        </div>
      </div>

      <div className="grid gap-sm sm:grid-cols-2">
        <div>
          <label htmlFor="startTime" className={LABEL}>
            Saat başlangıcı
          </label>
          <input id="startTime" name="startTime" type="time" className={FIELD} />
        </div>
        <div>
          <label htmlFor="endTime" className={LABEL}>
            Saat bitişi
          </label>
          <input id="endTime" name="endTime" type="time" className={FIELD} />
        </div>
      </div>

      <p className="text-label-sm text-on-surface-variant">
        Tarih ve saat boş bırakılırsa sınır yok. Bitiş saati <strong>hariçtir</strong>: 12:00–17:00
        kuralı 17:00 turuna uygulanmaz.
      </p>

      <div>
        <label htmlFor="priority" className={LABEL}>
          Öncelik
        </label>
        <input
          id="priority"
          name="priority"
          type="number"
          min={0}
          max={100}
          step={1}
          defaultValue={0}
          className={FIELD}
        />
        <p className="mt-1 text-label-sm text-on-surface-variant">
          Birden fazla kural aynı saate uyarsa <strong>önceliği yüksek olan</strong> geçerlidir.
          Eşitlikte önce eklenen kazanır.
        </p>
      </div>

      <Notice state={state} />

      <button type="submit" disabled={pending} className={`mt-sm ${PRIMARY_BUTTON} self-start`}>
        {pending ? 'Ekleniyor…' : 'Kuralı Ekle'}
      </button>
    </form>
  );
}

export function DeletePriceRuleButton({
  activityId,
  id,
}: {
  activityId: string;
  id: string;
}) {
  const [state, action, pending] = useActionState<PricingState, FormData>(
    deletePriceRuleAction,
    {}
  );

  return (
    <form action={action}>
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="text-label-bold text-error">
        {pending ? 'Siliniyor…' : 'Sil'}
      </button>
      {state.error && (
        <span role="alert" className="ml-2 text-label-sm text-error">
          {state.error}
        </span>
      )}
    </form>
  );
}

export function GroupDiscountForm({ activityId }: { activityId: string }) {
  const [state, action, pending] = useActionState<PricingState, FormData>(
    saveGroupDiscountAction,
    {}
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-sm">
      <input type="hidden" name="activityId" value={activityId} />

      <div>
        <label htmlFor="minPeople" className={LABEL}>
          Kaç kişiden itibaren
        </label>
        <input
          id="minPeople"
          name="minPeople"
          type="number"
          required
          min={2}
          step={1}
          defaultValue={4}
          className={`${FIELD} w-40`}
        />
      </div>

      <div>
        <label htmlFor="percent" className={LABEL}>
          İndirim (%)
        </label>
        <input
          id="percent"
          name="percent"
          type="number"
          required
          min={1}
          max={50}
          step={1}
          defaultValue={10}
          className={`${FIELD} w-32`}
        />
      </div>

      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        {pending ? 'Kaydediliyor…' : 'Kaydet'}
      </button>

      <div className="w-full">
        <Notice state={state} />
      </div>
    </form>
  );
}

export function DeleteGroupDiscountButton({
  activityId,
  id,
}: {
  activityId: string;
  id: string;
}) {
  const [state, action, pending] = useActionState<PricingState, FormData>(
    deleteGroupDiscountAction,
    {}
  );

  return (
    <form action={action}>
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={`${GHOST_BUTTON} px-3 py-1`}>
        {pending ? '…' : 'Sil'}
      </button>
      {state.error && (
        <span role="alert" className="ml-2 text-label-sm text-error">
          {state.error}
        </span>
      )}
    </form>
  );
}
