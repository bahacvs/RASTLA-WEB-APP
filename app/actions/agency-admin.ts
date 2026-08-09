'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatform } from '@/lib/platform-auth';
import {
  createAgency,
  createAgencyUser,
  setAgencyStatus,
  setAgencyUserStatus,
} from '@/lib/db/agencies';
import { generatePassword } from '@/lib/password.mjs';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';

/**
 * RASTLA'nın acente yönetimi.
 *
 * Acente açmak `admin` yetkisi: kimin misafir yönlendirebileceği ticari bir
 * karar ve geri dönüşü, her gün yapılan ilan incelemesinden daha pahalı.
 *
 * **Parola yalnızca bir kez, ekranda gösteriliyor.** Veritabanında özet
 * saklanıyor ve e-postayla göndermenin bir yolu yok — gönderilseydi parola
 * üçüncü bir sunucudan geçer ve orada kalırdı.
 */

export type AgencyAdminState = {
  error?: string;
  message?: string;
  /** Yeni açılan hesabın parolası — YALNIZCA bu yanıtta, bir kez. */
  password?: string;
};

export async function createAgencyAction(
  _prev: AgencyAdminState,
  formData: FormData
): Promise<AgencyAdminState> {
  const user = await requirePlatform('acente.yonet');
  if (!user) return { error: 'Bu işlem için yönetici yetkisi gerekir.' };

  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2) return { error: 'Acente adı en az 2 karakter olmalı.' };

  const agency = await createAgency({
    name,
    contactEmail: String(formData.get('contactEmail') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
  });

  await record({
    action: 'agency.created',
    actorType: 'system',
    actorId: user.id,
    targetType: 'agency',
    targetId: agency.id,
    ...(await requestContext()),
    meta: { name },
  });

  revalidatePath('/yonetim/acenteler');
  return { message: `${name} açıldı. Şimdi bir hesap ekleyin.` };
}

export async function createAgencyUserAction(
  _prev: AgencyAdminState,
  formData: FormData
): Promise<AgencyAdminState> {
  const user = await requirePlatform('acente.yonet');
  if (!user) return { error: 'Bu işlem için yönetici yetkisi gerekir.' };

  const agencyId = String(formData.get('agencyId') ?? '');
  const email = String(formData.get('email') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();

  if (!agencyId) return { error: 'Acente seçilmedi.' };
  if (!email.includes('@')) return { error: 'Geçerli bir e-posta girin.' };
  if (name.length < 2) return { error: 'Ad soyad girin.' };

  const password = generatePassword();
  const result = await createAgencyUser({ agencyId, email, name, password });

  if (!result.ok) {
    if (result.reason === 'duplicate') return { error: 'Bu e-posta zaten kayıtlı.' };
    return { error: 'Acente bulunamadı.' };
  }

  await record({
    action: 'agency.created',
    actorType: 'system',
    actorId: user.id,
    targetType: 'agency_user',
    targetId: result.user.id,
    ...(await requestContext()),
    // PAROLA GÜNLÜĞE YAZILMAZ. Kayıt hesabın açıldığını söyler, ne olduğunu
    // değil.
    meta: { agencyId, email },
  });

  revalidatePath('/yonetim/acenteler');
  return {
    message: `${name} için hesap açıldı. Parola bir daha gösterilmeyecek.`,
    password,
  };
}

export async function setAgencyStatusAction(
  _prev: AgencyAdminState,
  formData: FormData
): Promise<AgencyAdminState> {
  const user = await requirePlatform('acente.yonet');
  if (!user) return { error: 'Bu işlem için yönetici yetkisi gerekir.' };

  const agencyId = String(formData.get('agencyId') ?? '');
  const suspend = formData.get('suspend') === '1';

  const changed = await setAgencyStatus(agencyId, suspend ? 'suspended' : 'active');
  if (!changed) return { error: 'Acente bulunamadı.' };

  await record({
    action: suspend ? 'agency.suspended' : 'agency.resumed',
    actorType: 'system',
    actorId: user.id,
    targetType: 'agency',
    targetId: agencyId,
    ...(await requestContext()),
    meta: null,
  });

  revalidatePath('/yonetim/acenteler');
  return {
    // Askı ANINDA etkili: acentenin durumu her istekte soruluyor, çerezden
    // değil (bkz. lib/agency-auth.ts). Açık oturumlar da düşer.
    message: suspend
      ? 'Acente askıya alındı. Açık oturumlar anında düştü.'
      : 'Acente yeniden aktif.',
  };
}

export async function setAgencyUserStatusAction(
  _prev: AgencyAdminState,
  formData: FormData
): Promise<AgencyAdminState> {
  const user = await requirePlatform('acente.yonet');
  if (!user) return { error: 'Bu işlem için yönetici yetkisi gerekir.' };

  const userId = String(formData.get('userId') ?? '');
  const suspend = formData.get('suspend') === '1';

  const changed = await setAgencyUserStatus(userId, suspend ? 'suspended' : 'active');
  if (!changed) return { error: 'Hesap bulunamadı.' };

  revalidatePath('/yonetim/acenteler');
  return { message: suspend ? 'Hesap askıya alındı.' : 'Hesap yeniden aktif.' };
}
