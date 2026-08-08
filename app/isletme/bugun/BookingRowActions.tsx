'use client';

import { useActionState } from 'react';
import { Icon } from '@/components/Icon';
import {
  markAttendedAction,
  markNoShowAction,
  type AttendanceState,
} from '@/app/actions/attendance';

const CHIP =
  'inline-flex items-center gap-1 rounded-full border border-outline-variant px-3 py-1.5 text-label-bold text-on-surface-variant transition-transform active:scale-95 disabled:opacity-50';

/**
 * Bir rezervasyon satırının altındaki hızlı işlemler.
 *
 * Sahadaki kişi telefonu tek eliyle tutuyor; en çok yapılan üç işlem (ara,
 * yaz, geldi işaretle) tek dokunuş uzakta olmalı. Menü içine gizlenselerdi
 * personel yine deftere dönerdi.
 *
 * `tel:` ve `wa.me` bağlantıları dış SDK değil düz bağlantı: kullanıcı
 * dokunmadıkça hiçbir istek çıkmıyor.
 */
export function BookingRowActions({
  code,
  phone,
  people,
  status,
  attended,
  noShow,
  canCheckIn,
  canManage,
}: {
  code: string;
  phone: string;
  people: number;
  status: string;
  attended: number | null;
  noShow: boolean;
  canCheckIn: boolean;
  canManage: boolean;
}) {
  const [checkInState, checkIn, checkingIn] = useActionState<AttendanceState, FormData>(
    markAttendedAction,
    {}
  );
  const [noShowState, noShowAction, markingNoShow] = useActionState<AttendanceState, FormData>(
    markNoShowAction,
    {}
  );

  // Numara E.164 saklanıyor; wa.me başında + istemiyor.
  const waNumber = phone.replace(/\D/g, '');
  const settled = status === 'redeemed' || noShow;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {phone && (
        <>
          <a href={`tel:+${waNumber}`} className={CHIP}>
            <Icon name="person" size={16} />
            Ara
          </a>
          <a
            href={`https://wa.me/${waNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className={CHIP}
          >
            WhatsApp
          </a>
        </>
      )}

      {canCheckIn && status === 'confirmed' && !settled && (
        <>
          <form action={checkIn} className="inline-flex items-center gap-1">
            <input type="hidden" name="code" value={code} />
            {/*
              Gelen kişi sayısı rezervasyondakinden az olabilir. Varsayılan
              olarak tam sayı geliyor; personel gerekirse düşürüyor. Boş
              bırakılırsa sunucu rezervasyondaki sayıyı yazıyor.
            */}
            <input
              name="attended"
              type="number"
              min={0}
              max={people}
              defaultValue={people}
              aria-label="Gelen kişi sayısı"
              className="h-9 w-16 rounded-lg border border-outline-variant bg-surface px-2 text-body-md"
            />
            <button type="submit" disabled={checkingIn} className={CHIP}>
              <Icon name="check_circle" size={16} />
              {checkingIn ? 'İşleniyor…' : 'Geldi'}
            </button>
          </form>

          <form action={noShowAction}>
            <input type="hidden" name="code" value={code} />
            <button type="submit" disabled={markingNoShow} className={CHIP}>
              {markingNoShow ? 'İşleniyor…' : 'Gelmedi'}
            </button>
          </form>
        </>
      )}

      {canManage && (
        <a href={`/isletme/rezervasyonlar`} className={CHIP}>
          Rezervasyonu aç
        </a>
      )}

      {attended !== null && status === 'redeemed' && (
        <span className="text-label-sm text-on-surface-variant">{attended} kişi geldi</span>
      )}

      {(checkInState.error ?? noShowState.error) && (
        <p role="alert" className="w-full text-body-md text-error">
          {checkInState.error ?? noShowState.error}
        </p>
      )}
    </div>
  );
}
