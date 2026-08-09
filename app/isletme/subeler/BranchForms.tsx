'use client';

import { useActionState, useState } from 'react';
import { deleteBranchAction, saveBranchAction, type BranchState } from '@/app/actions/branch';
import { FIELD, LABEL } from '@/components/form';

function Feedback({ state }: { state: BranchState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-sm text-body-md text-error">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="mt-sm text-body-md text-primary">
        {state.message}
      </p>
    );
  }
  return null;
}

/**
 * Şube ekleme ve düzenleme — aynı form.
 *
 * `id` gizli alanda taşınıyor ve varsa güncelleme, yoksa ekleme oluyor. İki
 * ayrı bileşen yazmak, aynı doğrulamayı iki yerde tutmak demekti.
 */
export function BranchForm({
  branch,
}: {
  branch?: { id: string; name: string; address: string | null; lat: number | null; lng: number | null };
}) {
  const [state, action, pending] = useActionState<BranchState, FormData>(saveBranchAction, {});

  return (
    <form action={action}>
      {branch && <input type="hidden" name="id" value={branch.id} />}

      <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`name-${branch?.id ?? 'yeni'}`} className={LABEL}>
            Şube adı
          </label>
          <input
            id={`name-${branch?.id ?? 'yeni'}`}
            name="name"
            type="text"
            required
            minLength={2}
            defaultValue={branch?.name}
            placeholder="Büyükçekmece İskele"
            className={FIELD}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`address-${branch?.id ?? 'yeni'}`} className={LABEL}>
            Adres <span className="font-normal">(isteğe bağlı)</span>
          </label>
          <input
            id={`address-${branch?.id ?? 'yeni'}`}
            name="address"
            type="text"
            defaultValue={branch?.address ?? ''}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor={`lat-${branch?.id ?? 'yeni'}`} className={LABEL}>
            Enlem <span className="font-normal">(isteğe bağlı)</span>
          </label>
          <input
            id={`lat-${branch?.id ?? 'yeni'}`}
            name="lat"
            inputMode="decimal"
            defaultValue={branch?.lat ?? ''}
            placeholder="41.0155"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor={`lng-${branch?.id ?? 'yeni'}`} className={LABEL}>
            Boylam <span className="font-normal">(isteğe bağlı)</span>
          </label>
          <input
            id={`lng-${branch?.id ?? 'yeni'}`}
            name="lng"
            inputMode="decimal"
            defaultValue={branch?.lng ?? ''}
            placeholder="28.5950"
            className={FIELD}
          />
        </div>
      </div>

      <Feedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="mt-md rounded-lg bg-primary px-4 py-3 text-label-bold text-on-primary disabled:opacity-60"
      >
        {pending ? 'Kaydediliyor…' : branch ? 'Güncelle' : 'Şube Ekle'}
      </button>
    </form>
  );
}

/**
 * Şubeyi siler. Onay ister.
 *
 * Uyarı metni ne olacağını AÇIKÇA söylüyor: ilanlar silinmiyor, şubesiz
 * kalıyor. "Emin misiniz?" diye sorup sonucu söylememek, kullanıcıyı tahmin
 * etmeye zorlamak olurdu.
 */
export function DeleteBranchButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<BranchState, FormData>(deleteBranchAction, {});
  const [confirming, setConfirming] = useState(false);

  if (state.message) {
    return <p className="text-label-sm text-on-surface-variant">{state.message}</p>;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-label-bold text-on-surface-variant hover:underline"
      >
        Sil
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-label-sm text-on-surface-variant">
        {name} silinecek. İlanlar durur, yalnızca şubesiz kalır.
      </span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-label-bold text-on-surface-variant"
      >
        Vazgeç
      </button>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-error-container px-3 py-1 text-label-bold text-on-error-container disabled:opacity-50"
      >
        {pending ? '…' : 'Onayla'}
      </button>
      {state.error && <span className="text-label-sm text-error">{state.error}</span>}
    </form>
  );
}
