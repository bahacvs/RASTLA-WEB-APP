'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { createBranch, deleteBranch, getBranch, updateBranch } from '@/lib/db/branches';
import { updateActivityFields, getActivityById } from '@/lib/db/activities';

/**
 * Şube yönetimi.
 *
 * Yetki `takvim.yonet`: şube bir operasyon kavramı (hangi iskelede
 * çalışıyoruz), ticari bir karar değil. Sahibe özel tutmak, iki lokasyonlu bir
 * işletmede yöneticinin gününü sahibi aramadan düzenleyememesi demekti.
 */

export type BranchState = { error?: string; message?: string };

function readCoordinate(raw: FormDataEntryValue | null, max: number): number | null | 'invalid' {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < -max || value > max) return 'invalid';
  return value;
}

export async function saveBranchAction(
  _prev: BranchState,
  formData: FormData
): Promise<BranchState> {
  const session = await requireCapability('takvim.yonet');
  if (!session) return { error: 'Bu işlem için yetkiniz yok.' };

  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2) return { error: 'Şube adı en az 2 karakter olmalı.' };

  const address = String(formData.get('address') ?? '').trim() || null;
  const lat = readCoordinate(formData.get('lat'), 90);
  const lng = readCoordinate(formData.get('lng'), 180);
  if (lat === 'invalid') return { error: 'Enlem geçersiz.' };
  if (lng === 'invalid') return { error: 'Boylam geçersiz.' };

  const id = String(formData.get('id') ?? '').trim();

  if (id) {
    // Sahiplik kontrolü ayrı bir okumayla DEĞİL, güncelleme koşulunda:
    // `updateBranch` işletme kimliğini WHERE'e koyuyor. Ayrı okuma yapılsaydı
    // arada şube devredilebilir ve kontrol boşa düşerdi.
    const updated = await updateBranch(id, session.operator.id, { name, address, lat, lng });
    if (!updated) return { error: 'Bu şubeye erişim yetkiniz yok.' };

    revalidatePath('/isletme/subeler');
    return { message: 'Şube güncellendi.' };
  }

  await createBranch({ operatorId: session.operator.id, name, address, lat, lng });
  revalidatePath('/isletme/subeler');
  return { message: 'Şube eklendi.' };
}

export async function deleteBranchAction(
  _prev: BranchState,
  formData: FormData
): Promise<BranchState> {
  const session = await requireCapability('takvim.yonet');
  if (!session) return { error: 'Bu işlem için yetkiniz yok.' };

  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { error: 'Şube seçilmedi.' };

  const removed = await deleteBranch(id, session.operator.id);
  if (!removed) return { error: 'Bu şubeye erişim yetkiniz yok.' };

  revalidatePath('/isletme/subeler');
  revalidatePath('/isletme/aktiviteler');
  return { message: 'Şube silindi. İlanlar duruyor, yalnızca şubesiz kaldı.' };
}

/**
 * Bir ilanı şubeye bağlar ya da bağını kaldırır.
 *
 * Şube kimliği **işletmeye göre doğrulanıyor**: `branch_id` sütunu eski
 * kurulumlarda yabancı anahtar kısıtı taşımıyor (bkz. lib/db/index.mjs) ve
 * kısıt olsaydı bile "bu şube bu işletmenin mi" sorusunu cevaplamazdı.
 */
export async function setActivityBranchAction(
  _prev: BranchState,
  formData: FormData
): Promise<BranchState> {
  const session = await requireCapability('aktivite.yonet');
  if (!session) return { error: 'Bu işlem için yetkiniz yok.' };

  const activityId = String(formData.get('activityId') ?? '');
  const activity = await getActivityById(activityId);
  if (!activity || activity.operatorId !== session.operator.id) {
    return { error: 'Bu aktiviteye erişim yetkiniz yok.' };
  }

  const branchId = String(formData.get('branchId') ?? '').trim();

  if (branchId) {
    const branch = await getBranch(branchId, session.operator.id);
    if (!branch) return { error: 'Bu şube bu işletmeye ait değil.' };
  }

  await updateActivityFields(activityId, { branchId: branchId || null });

  revalidatePath('/isletme/aktiviteler');
  revalidatePath('/isletme/bugun');
  return { message: branchId ? 'Şube atandı.' : 'Şube bağı kaldırıldı.' };
}
