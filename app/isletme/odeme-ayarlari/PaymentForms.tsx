'use client';

import { useActionState, useState } from 'react';
import {
  createSubmerchantAction,
  savePaymentProfileAction,
  type PaymentSettingsState,
} from '@/app/actions/payment-settings';
import type { LegalType, OperatorPaymentProfile } from '@/lib/db/operators';

const FIELD =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none';

const CARD =
  'flex flex-col gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card';

function Feedback({ state }: { state: PaymentSettingsState }) {
  return (
    <>
      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container"
        >
          {state.error}
        </p>
      )}
      {state.message && (
        <p
          role="status"
          className="rounded-lg bg-secondary-container px-3 py-2 text-body-md text-on-secondary-container"
        >
          {state.message}
        </p>
      )}
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-label-bold text-on-surface-variant">{children}</span>;
}

/**
 * Ticari bilgi formu.
 *
 * Hangi alanların zorunlu olduğu işletme türüne göre değişiyor: gerçek kişi ve
 * şahıs şirketinde TCKN, sermaye şirketinde vergi numarası. Alanları duruma
 * göre göstermek, doldurulmayacak kutuları ekranda tutmaktan iyi — ama asıl
 * doğrulama sunucuda, çünkü istemcideki her kural atlanabilir.
 */
export function PaymentProfileForm({ profile }: { profile: OperatorPaymentProfile }) {
  const [state, action, pending] = useActionState<PaymentSettingsState, FormData>(
    savePaymentProfileAction,
    {}
  );
  const [legalType, setLegalType] = useState<LegalType>(profile.legalType ?? 'personal');

  return (
    <form action={action} className={CARD}>
      <label>
        <Label>İşletme türü</Label>
        <select
          name="legalType"
          value={legalType}
          onChange={(e) => setLegalType(e.target.value as LegalType)}
          className={FIELD}
        >
          <option value="personal">Gerçek kişi</option>
          <option value="private">Şahıs şirketi</option>
          <option value="limited">Limited / Anonim şirket</option>
        </select>
      </label>

      <label>
        <Label>{legalType === 'limited' ? 'Şirket unvanı' : 'Ad soyad / unvan'}</Label>
        <input name="legalName" defaultValue={profile.legalName ?? ''} required className={FIELD} />
      </label>

      {legalType !== 'limited' && (
        <label>
          <Label>T.C. kimlik numarası</Label>
          <input
            name="identityNumber"
            defaultValue={profile.identityNumber ?? ''}
            inputMode="numeric"
            maxLength={11}
            className={FIELD}
          />
        </label>
      )}

      {legalType !== 'personal' && (
        <>
          <label>
            <Label>Vergi numarası</Label>
            <input
              name="taxNumber"
              defaultValue={profile.taxNumber ?? ''}
              inputMode="numeric"
              className={FIELD}
            />
          </label>
          <label>
            <Label>Vergi dairesi</Label>
            <input name="taxOffice" defaultValue={profile.taxOffice ?? ''} className={FIELD} />
          </label>
        </>
      )}

      <label>
        <Label>IBAN</Label>
        <input
          name="iban"
          defaultValue={profile.iban ?? ''}
          placeholder="TR00 0000 0000 0000 0000 0000 00"
          required
          className={FIELD}
        />
        <span className="mt-1 block text-label-sm text-on-surface-variant">
          Hakedişiniz bu hesaba aktarılır. Hesap işletmenin kendi adına olmalı.
        </span>
      </label>

      <label>
        <Label>Açık adres</Label>
        <textarea
          name="legalAddress"
          defaultValue={profile.legalAddress ?? ''}
          required
          rows={3}
          className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
        />
      </label>

      <label>
        <Label>Muhasebe e-postası</Label>
        <input
          name="contactEmail"
          type="email"
          defaultValue={profile.contactEmail ?? ''}
          required
          className={FIELD}
        />
      </label>

      <Feedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-lg bg-primary text-label-bold text-on-primary transition-transform active:scale-95 disabled:opacity-60"
      >
        {pending ? 'Kaydediliyor…' : 'Bilgileri kaydet'}
      </button>
    </form>
  );
}

export function CreateSubmerchantForm({ ready }: { ready: boolean }) {
  const [state, action, pending] = useActionState<PaymentSettingsState, FormData>(
    createSubmerchantAction,
    {}
  );

  return (
    <form action={action} className={CARD}>
      <p className="text-body-md text-on-surface-variant">
        Bilgileriniz ödeme sağlayıcısına gönderilir ve işletmeniz adına bir alt üye işyeri açılır.
        Bu adım tamamlanmadan aktiviteleriniz online ödemeye açılmaz.
      </p>

      <label className="flex items-start gap-2 text-body-md text-on-surface-variant">
        <input
          type="checkbox"
          name="onay"
          value="evet"
          required
          className="mt-1 size-4 accent-primary"
        />
        <span>
          Vergi/kimlik numaram, IBAN&apos;ım ve adresimin ödeme sağlayıcısına aktarılmasını
          onaylıyorum.
        </span>
      </label>

      <Feedback state={state} />

      <button
        type="submit"
        disabled={pending || !ready}
        className="h-12 rounded-lg bg-primary text-label-bold text-on-primary transition-transform active:scale-95 disabled:opacity-60"
      >
        {pending ? 'Gönderiliyor…' : 'Ödeme sağlayıcısına gönder'}
      </button>
    </form>
  );
}
