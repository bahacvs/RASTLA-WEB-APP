'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { getBookingByCode, markNoShow, redeemBooking } from '@/lib/db/bookings';
import { record } from '@/lib/db/audit';
import { releasePayoutForBooking, reversePayoutForBooking } from '@/lib/payments/payouts';
import { requestContext } from '@/lib/request-context';

/**
 * Bugün ekranından katılım işaretleme.
 *
 * QR okutmakla aynı işi yapar ve AYNI koşullu UPDATE'e dayanır: bir bilet
 * yalnızca bir kez kullanılabilir. İki ayrı yol (kamera ve düğme) olmasının
 * sebebi sahadaki gerçek: telefonun kamerası bazen çalışmaz, güneşte ekran
 * okunmaz, müşteri QR'ı bulamaz. Güvence her iki yolda da aynı yerden geliyor.
 */
export type AttendanceState = { error?: string; message?: string };

export async function markAttendedAction(
  _prev: AttendanceState,
  formData: FormData
): Promise<AttendanceState> {
  const session = await requireCapability('checkin.yap');
  if (!session) return { error: 'Bu işlem için yetkiniz yok.' };

  const code = String(formData.get('code') ?? '');
  const attendedRaw = String(formData.get('attended') ?? '');
  const attended = attendedRaw ? Number(attendedRaw) : undefined;

  if (attended !== undefined && (!Number.isInteger(attended) || attended < 0)) {
    return { error: 'Katılımcı sayısı geçersiz.' };
  }

  const booking = await getBookingByCode(code);
  // İşletme yalnızca kendi biletini okutabilir.
  if (!booking || booking.operatorId !== session.operator.id) {
    return { error: 'Bilet bulunamadı.' };
  }

  const result = await redeemBooking(code, session.user.id, attended);

  // Hizmet verildi: işletmenin payı serbest bırakılır. Yalnızca okutmanın
  // BAŞARILI olduğu dalda çağrılıyor — `redeemBooking` tek koşullu UPDATE
  // olduğu için eşzamanlı iki okutmadan yalnızca biri buraya düşer.
  if (result.ok) await releasePayoutForBooking(result.booking.id);

  if (!result.ok) {
    const reason =
      result.reason === 'already_redeemed'
        ? 'Bu bilet zaten kullanıldı.'
        : result.reason === 'cancelled'
          ? 'Bu rezervasyon iptal edilmiş.'
          : result.reason === 'unpaid'
            ? 'Bu rezervasyonun ödemesi tamamlanmamış.'
            : 'Bilet onaylanamadı.';
    return { error: reason };
  }

  await record({
    action: 'booking.redeemed',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: session.operator.id,
    targetType: 'booking',
    targetId: result.booking.id,
    ...(await requestContext()),
    meta: { attended: attended ?? null, from: 'bugun' },
  });

  revalidatePath('/isletme/bugun');
  return { message: 'Katılım işaretlendi.' };
}

/**
 * Müşteri gelmedi.
 *
 * Kapasite geri verilmez: seans yapıldı, yer tutuldu, işletme o yeri
 * başkasına satamadı. Kaydın kendisi de silinmiyor — no-show geçmişi
 * uyuşmazlıkta ve müşteri profilinde işe yarıyor.
 */
export async function markNoShowAction(
  _prev: AttendanceState,
  formData: FormData
): Promise<AttendanceState> {
  const session = await requireCapability('checkin.yap');
  if (!session) return { error: 'Bu işlem için yetkiniz yok.' };

  const code = String(formData.get('code') ?? '');
  const booking = await getBookingByCode(code);
  if (!booking || booking.operatorId !== session.operator.id) {
    return { error: 'Bilet bulunamadı.' };
  }

  const result = await markNoShow(code, session.user.id);

  // Hizmet verilmedi: bloke pay sağlayıcıda geri çevrilir. Müşteriye para
  // dönüp dönmeyeceği ayrı bir karar ve iptal politikasına tabi.
  if (result.ok) await reversePayoutForBooking(booking.id);

  if (!result.ok) {
    return {
      error:
        result.reason === 'not_pending'
          ? 'Bu rezervasyon zaten işaretlenmiş ya da kullanılmış.'
          : 'Bilet bulunamadı.',
    };
  }

  await record({
    action: 'booking.no_show',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: session.operator.id,
    targetType: 'booking',
    targetId: booking.id,
    ...(await requestContext()),
    meta: null,
  });

  revalidatePath('/isletme/bugun');
  return { message: 'Gelmedi olarak işaretlendi.' };
}
