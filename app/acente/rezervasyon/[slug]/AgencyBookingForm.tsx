'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { createAgencyBookingAction, type AgencyBookingState } from '@/app/actions/agency';
import { FIELD, LABEL, PRIMARY_BUTTON } from '@/components/form';

/**
 * Acentenin misafir adına yer tutma formu.
 *
 * Telefon numarası ZORUNLU ve bu bilinçli: iptal ve saat değişikliği
 * bildirimleri oraya gidiyor. Otelin numarası yazılırsa misafir haber almaz —
 * form bunu açıkça söylüyor.
 *
 * SMS doğrulaması İSTENMİYOR: misafir burada değil, resepsiyon görevlisi
 * onun adına işlem yapıyor ve gelmeyen bir koda takılmak akışı kilitlerdi.
 * Karşılığında bu rezervasyonlar `source='agency'` ile işaretli — kimin
 * açtığı belli.
 */
export function AgencyBookingForm({
  slotId,
  maxPeople,
}: {
  slotId: string;
  maxPeople: number;
}) {
  const [state, action, pending] = useActionState<AgencyBookingState, FormData>(
    createAgencyBookingAction,
    {}
  );

  if (state.code) {
    return (
      <div className="rounded-xl border border-outline-variant bg-secondary-container p-md text-on-secondary-container">
        <p className="text-body-md">{state.message}</p>
        <p className="mt-sm text-label-sm">Misafirin bilet kodu:</p>
        <p className="font-mono text-headline-sm">{state.code}</p>
        <p className="mt-sm text-label-sm">
          Bu kodu misafire verin; tesiste bu kodla karşılanacak.
        </p>
        <Link href="/acente/ara" className="mt-md inline-block text-label-bold underline">
          Yeni arama
        </Link>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="slotId" value={slotId} />

      <div className="mb-sm">
        <label htmlFor="name" className={LABEL}>
          Misafirin adı soyadı
        </label>
        <input id="name" name="name" type="text" required minLength={2} className={FIELD} />
      </div>

      <div className="mb-sm">
        <label htmlFor="phone" className={LABEL}>
          Misafirin cep telefonu
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          inputMode="tel"
          placeholder="05XX XXX XX XX"
          className={FIELD}
        />
        <p className="mt-1 text-label-sm text-on-surface-variant">
          İptal ve saat değişikliği mesajları bu numaraya gider. Otelin numarasını yazmayın —
          misafir haber almaz.
        </p>
      </div>

      <div className="mb-sm">
        <label htmlFor="people" className={LABEL}>
          Kişi sayısı
        </label>
        <input
          id="people"
          name="people"
          type="number"
          min={1}
          max={maxPeople}
          defaultValue={1}
          required
          className={FIELD}
        />
        <p className="mt-1 text-label-sm text-on-surface-variant">
          Bu saatte {maxPeople} yer kaldı.
        </p>
      </div>

      {state.error && (
        <p role="alert" className="mb-sm text-body-md text-error">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        {pending ? 'Yer tutuluyor…' : 'Yeri Tut'}
      </button>
    </form>
  );
}
