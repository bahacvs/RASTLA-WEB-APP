'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { resolveAlert } from '@/lib/alerts/index.mjs';

export type AlertState = { error?: string };

/**
 * Uyarıyı "gördüm" olarak kapatır.
 *
 * Kapatma **silme değildir**: satır durur, üstüne kimin ne zaman kapattığı
 * yazılır. İhlal müdahale planı "kim ne zaman fark etti" sorusunu soruyor ve
 * kapatılan uyarıyı yok etmek o cevabı ortadan kaldırırdı.
 *
 * Yetki kontrolü sorgunun İÇİNDE: `resolveAlert` yalnızca bu işletmeye ait ya
 * da sistem geneli bir uyarıyı kapatır. Kimlik formdan geliyor ve başkasının
 * uyarısını işaret edebilir.
 */
export async function resolveAlertAction(
  _prev: AlertState,
  formData: FormData
): Promise<AlertState> {
  const session = await requireCapability('uyari.kapat');
  if (!session) return { error: 'Bu işlem için yetkiniz yok.' };

  const alertId = String(formData.get('alertId') ?? '');
  if (!alertId) return { error: 'Uyarı bulunamadı.' };

  const closed = await resolveAlert(alertId, session.operator.id, session.user.id);
  if (!closed) return { error: 'Uyarı bulunamadı ya da zaten kapatılmış.' };

  revalidatePath('/isletme/gunluk');
  return {};
}
