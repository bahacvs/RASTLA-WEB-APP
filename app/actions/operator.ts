'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  cancelBooking,
  cancelDay,
  getBookingByCode,
  redeemBooking,
  type Booking,
} from '@/lib/db/bookings';
import { getUser } from '@/lib/db/users';
import { authenticateOperator } from '@/lib/operators';
import { clearOperatorSession, getOperatorId, setOperatorSession } from '@/lib/session';
import { getActivityBySlug } from '@/lib/db/activities';

export type LoginState = { error?: string };

export async function operatorLoginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const operatorId = String(formData.get('operatorId') ?? '');
  const code = String(formData.get('code') ?? '');

  const operator = authenticateOperator(operatorId, code);
  if (!operator) return { error: 'İşletme veya erişim kodu hatalı.' };

  await setOperatorSession(operator.id);
  redirect('/isletme/tara');
}

export async function operatorLogoutAction() {
  await clearOperatorSession();
  redirect('/isletme');
}

export type ScanState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  booking?: {
    code: string;
    activityTitle: string;
    customerName: string;
    date: string;
    time: string;
    party: string;
    redeemedAt?: string;
  };
};

function describe(booking: Booking, customerName: string) {
  return {
    code: booking.code,
    activityTitle: getActivityBySlug(booking.activitySlug)?.title ?? booking.activitySlug,
    customerName,
    date: booking.bookingDate,
    time: booking.bookingTime,
    party: `${booking.adults} yetişkin${booking.children > 0 ? `, ${booking.children} çocuk` : ''}`,
  };
}

/**
 * Bileti okutup onaylar.
 *
 * Yetkilendirme: bir işletme yalnızca kendi aktivitesine ait bileti
 * onaylayabilir. Bu kontrol, onaylama denemesinden ÖNCE yapılır — aksi hâlde
 * yanlış işletme bileti yakabilirdi.
 */
export async function redeemAction(_prev: ScanState, formData: FormData): Promise<ScanState> {
  const operatorId = await getOperatorId();
  if (!operatorId) return { status: 'error', message: 'Oturum sona ermiş. Tekrar giriş yapın.' };

  const raw = String(formData.get('code') ?? '').trim();
  if (!raw) return { status: 'error', message: 'Bilet kodu girin.' };

  // QR bir URL taşır; kamerayla okunduğunda son yol parçası koddur.
  const code = raw.includes('/') ? decodeURIComponent(raw.split('/').filter(Boolean).pop()!) : raw;

  const existing = getBookingByCode(code);
  if (!existing) {
    return { status: 'error', message: 'Bilet bulunamadı. Kodu kontrol edin.' };
  }
  if (existing.operatorId !== operatorId) {
    return { status: 'error', message: 'Bu bilet başka bir işletmeye ait.' };
  }

  const result = redeemBooking(code, operatorId);
  const customerName = getUser(existing.userId)?.name ?? '—';

  if (result.ok) {
    revalidatePath('/rezervasyonlarim');
    return {
      status: 'success',
      message: 'Bilet onaylandı. Misafiri kabul edebilirsiniz.',
      booking: describe(result.booking, customerName),
    };
  }

  if (result.reason === 'already_redeemed' && result.booking) {
    return {
      status: 'error',
      message: 'Bu bilet daha önce kullanılmış.',
      booking: {
        ...describe(result.booking, customerName),
        redeemedAt: new Date(result.booking.redeemedAt!).toLocaleString('tr-TR'),
      },
    };
  }

  return { status: 'error', message: 'Bilet geçersiz ya da iptal edilmiş.' };
}

export type OperatorCancelState = { error?: string; message?: string };

/** İşletmenin tek bir rezervasyonu iptal etmesi. */
export async function operatorCancelAction(
  _prev: OperatorCancelState,
  formData: FormData
): Promise<OperatorCancelState> {
  const operatorId = await getOperatorId();
  if (!operatorId) return { error: 'Oturum sona ermiş.' };

  const code = String(formData.get('code') ?? '').trim();
  const reason = formData.get('reason') === 'weather' ? 'weather' : 'operator';

  const booking = getBookingByCode(code);
  if (!booking || booking.operatorId !== operatorId) {
    return { error: 'Bu rezervasyona erişim yetkiniz yok.' };
  }

  const result = cancelBooking(code, reason);
  if (!result.ok) {
    if (result.reason === 'already_redeemed') {
      return { error: 'Bilet kullanılmış, iptal edilemez.' };
    }
    return { error: 'Rezervasyon zaten iptal edilmiş.' };
  }

  revalidatePath('/isletme/rezervasyonlar');
  return { message: 'Rezervasyon iptal edildi ve slot kapasitesi geri verildi.' };
}

/**
 * Hava koşulu nedeniyle bir günün tüm rezervasyonlarını iptal eder.
 *
 * Su sporlarında en sık iptal sebebi budur ve müşteri kusurlu değildir; bu
 * yüzden ayrı bir sebep koduyla kaydedilir — iade politikası farklı işler.
 */
export async function cancelDayAction(
  _prev: OperatorCancelState,
  formData: FormData
): Promise<OperatorCancelState> {
  const operatorId = await getOperatorId();
  if (!operatorId) return { error: 'Oturum sona ermiş.' };

  const date = String(formData.get('date') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Gün geçersiz.' };

  const { cancelled, skipped } = cancelDay(operatorId, date, 'weather');

  revalidatePath('/isletme/rezervasyonlar');
  return {
    message:
      cancelled === 0
        ? 'İptal edilecek aktif rezervasyon yoktu.'
        : `${cancelled} rezervasyon iptal edildi${skipped > 0 ? `, ${skipped} tanesi atlandı` : ''}. Misafirleri bilgilendirmeyi unutmayın.`,
  };
}
