'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cancelBooking, listBookingsForUser } from '@/lib/db/bookings';
import { deleteUser, getUser } from '@/lib/db/users';
import { clearUserSession } from '@/lib/session';
import { currentUserId } from '@/lib/auth';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';

/**
 * Hesap silme — KVKK md. 7 ve md. 11.
 *
 * Metin yazmak hak tanımaz; talebin karşılanabilir olması gerekir. Bu eylem,
 * "silme talebi elle karşılanıyor" durumunu kaldırır.
 */

export type AccountState = { error?: string; message?: string; activeCodes?: string[] };

export async function deleteAccountAction(
  _prev: AccountState,
  formData: FormData
): Promise<AccountState> {
  const userId = await currentUserId();
  if (!userId) return { error: 'Oturum bulunamadı. Rezervasyonu yaptığınız cihazdan deneyin.' };

  const user = getUser(userId);
  if (!user || user.deletedAt) return { error: 'Hesap bulunamadı.' };

  // Yanlışlıkla tıklamaya karşı: kullanıcı adını yazarak onaylar. Silme geri
  // alınamaz, tek tıkla yapılmamalı.
  const confirmation = String(formData.get('confirm') ?? '').trim();
  if (confirmation.toLocaleLowerCase('tr') !== 'sil') {
    return { error: 'Onaylamak için kutuya SİL yazın.' };
  }

  const alsoCancel = formData.get('cancelActive') === 'on';

  if (alsoCancel) {
    // Önce iptal, sonra silme. Ters sırada yapılsaydı iptal edilen
    // rezervasyonun sahibi zaten anonim olurdu ve işletme kimin iptal
    // ettiğini bilemezdi.
    for (const booking of listBookingsForUser(userId)) {
      if (booking.status === 'confirmed') cancelBooking(booking.code, 'customer');
    }
  }

  const result = deleteUser(userId);

  if (!result.ok) {
    if (result.reason === 'has_active_bookings') {
      return {
        error:
          'Aktif rezervasyonunuz var. Hizmet verilebilmesi için işletmenin adınıza ihtiyacı var; ' +
          'önce bu rezervasyonları iptal edin ya da aşağıdaki kutuyu işaretleyin.',
        activeCodes: result.activeCodes,
      };
    }
    return { error: 'Hesap zaten silinmiş.' };
  }

  // Günlüğe silinen kişinin adı ya da telefonu YAZILMAZ; kaydın amacı
  // talebin karşılandığını göstermek, veriyi başka bir yerde yaşatmak değil.
  record({
    action: 'account.deleted',
    actorType: 'customer',
    actorId: userId,
    targetType: 'user',
    targetId: userId,
    ...(await requestContext()),
    meta: { anonymizedBookings: result.anonymizedBookings, cancelledActive: alsoCancel },
  });

  await clearUserSession();
  revalidatePath('/rezervasyonlarim');
  redirect('/?hesap=silindi');
}
