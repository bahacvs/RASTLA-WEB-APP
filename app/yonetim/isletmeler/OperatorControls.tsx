'use client';

import { useActionState } from 'react';
import {
  setCommissionAction,
  setVerificationAction,
  togglePayoutsAction,
  type PlatformActionState,
} from '@/app/actions/platform';
import {
  VERIFICATION_LABELS,
  VERIFICATION_STATUSES,
  type VerificationStatus,
} from '@/lib/verification-status';

const FIELD =
  'h-11 rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none';
const BUTTON =
  'h-11 rounded-lg border border-outline-variant px-4 text-label-bold text-on-surface-variant transition-transform active:scale-95 disabled:opacity-60';

/**
 * Bir işletme hakkında verilecek üç karar.
 *
 * Üçü ayrı form: biri gönderilirken diğerlerinin alanları taşınmıyor ve
 * yanlışlıkla birlikte değişmiyorlar. Tek formda toplansaydı, yalnızca notu
 * güncellemek isteyen biri farkında olmadan komisyonu da yazardı.
 *
 * Yetkisi olmayana ilgili bölüm hiç ÇİZİLMİYOR; ama asıl engel bu değil —
 * her sunucu eyleminin ilk satırındaki `requirePlatform`.
 */
export function OperatorControls({
  operatorId,
  verificationStatus,
  commissionPercent,
  payoutsSuspended,
  mayVerify,
  maySetCommission,
  maySuspendPayouts,
}: {
  operatorId: string;
  verificationStatus: VerificationStatus;
  commissionPercent: number;
  payoutsSuspended: boolean;
  mayVerify: boolean;
  maySetCommission: boolean;
  maySuspendPayouts: boolean;
}) {
  const [verifyState, verify, verifying] = useActionState<PlatformActionState, FormData>(
    setVerificationAction,
    {}
  );
  const [commissionState, commission, settingCommission] = useActionState<
    PlatformActionState,
    FormData
  >(setCommissionAction, {});

  return (
    <div className="flex flex-col gap-sm border-t border-surface-variant pt-sm">
      {mayVerify && (
        <form action={verify} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="operatorId" value={operatorId} />
          <div>
            <label
              htmlFor={`status-${operatorId}`}
              className="mb-1 block text-label-sm text-on-surface-variant"
            >
              Doğrulama durumu
            </label>
            <select
              id={`status-${operatorId}`}
              name="status"
              defaultValue={verificationStatus}
              className={FIELD}
            >
              {VERIFICATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {VERIFICATION_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[12rem] flex-1">
            <label
              htmlFor={`note-${operatorId}`}
              className="mb-1 block text-label-sm text-on-surface-variant"
            >
              İç not (işletmeye gösterilmez)
            </label>
            <input id={`note-${operatorId}`} name="note" type="text" className={`${FIELD} w-full`} />
          </div>
          <button type="submit" disabled={verifying} className={BUTTON}>
            {verifying ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          {verifyState.error && (
            <p role="alert" className="w-full text-body-md text-error">
              {verifyState.error}
            </p>
          )}
          {verifyState.message && (
            <p role="status" className="w-full text-body-md text-primary">
              {verifyState.message}
            </p>
          )}
        </form>
      )}

      {maySetCommission && (
        <form action={commission} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="operatorId" value={operatorId} />
          <div>
            <label
              htmlFor={`percent-${operatorId}`}
              className="mb-1 block text-label-sm text-on-surface-variant"
            >
              Komisyon (%)
            </label>
            <input
              id={`percent-${operatorId}`}
              name="percent"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={commissionPercent}
              className={`${FIELD} w-28`}
            />
          </div>
          <button type="submit" disabled={settingCommission} className={BUTTON}>
            {settingCommission ? 'Kaydediliyor…' : 'Oranı Kaydet'}
          </button>
          {commissionState.error && (
            <p role="alert" className="w-full text-body-md text-error">
              {commissionState.error}
            </p>
          )}
          {commissionState.message && (
            <p role="status" className="w-full text-body-md text-primary">
              {commissionState.message}
            </p>
          )}
        </form>
      )}

      {maySuspendPayouts && (
        <form action={togglePayoutsAction}>
          <input type="hidden" name="operatorId" value={operatorId} />
          <input type="hidden" name="suspend" value={payoutsSuspended ? '0' : '1'} />
          <button type="submit" className={BUTTON}>
            {payoutsSuspended ? 'Hak edişi yeniden başlat' : 'Hak edişi durdur'}
          </button>
          <span className="ml-2 text-label-sm text-on-surface-variant">
            Durdurma rezervasyonu ve bilet okutmayı etkilemez; yalnızca para bloke kalır.
          </span>
        </form>
      )}
    </div>
  );
}
