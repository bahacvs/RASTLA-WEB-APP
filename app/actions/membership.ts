'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { currentOperator, requireCapability } from '@/lib/auth';
import {
  grantMembership,
  listMemberships,
  revokeMembership,
  roleAt,
} from '@/lib/db/memberships';
import { getOperatorUserByEmail, normalizeEmail } from '@/lib/db/operators';
import { setActiveOperator } from '@/lib/session';
import { isOperatorRole } from '@/lib/permissions';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';

/**
 * İşletmeler arası geçiş ve ek erişim verme.
 *
 * İki ayrı tüzel kişilik işleten bir kişi bugün iki hesapla, iki parolayla
 * giriyor ve gün içinde çıkıp yeniden giriyor. Bu dosya o gidip gelmeyi
 * ortadan kaldırıyor — kimliği çoğaltmadan.
 */

/**
 * Seçili işletmeyi değiştirir.
 *
 * **Kimlik doğrulaması burada yeniden yapılmıyor**, çünkü kişi zaten giriş
 * yapmış; yapılan şey erişim doğrulaması: hedef işletmede üyeliği yoksa çerez
 * hiç yazılmıyor. Yazılsa bile bir şey değişmezdi — `currentOperator` her
 * istekte üyeliği yeniden soruyor (bkz. lib/auth.ts) — ama geçersiz bir çerez
 * bırakmak, ileride o kontrolü gevşeten birine hazır bir açık bırakmak olurdu.
 */
export async function switchOperatorAction(formData: FormData) {
  const session = await currentOperator();
  if (!session) redirect('/isletme');

  const operatorId = String(formData.get('operatorId') ?? '');
  if (!operatorId) redirect('/isletme/bugun');

  const role = await roleAt(session.user.id, operatorId);
  if (!role) {
    // Sessizce yok sayılıyor: erişimi olmayan bir kimlik gönderen ya adres
    // çubuğuyla oynuyor ya da erişimi az önce kaldırılmış biri. İkisine de
    // yapılacak şey aynı — kendi işletmesinde kalmak.
    redirect('/isletme/bugun');
  }

  await setActiveOperator(operatorId);

  await record({
    action: 'operator_user.switched',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId,
    ...(await requestContext()),
    meta: { from: session.operator.id, to: operatorId, role },
  });

  revalidatePath('/isletme', 'layout');
  redirect('/isletme/bugun');
}

export type MembershipState = { error?: string; message?: string };

/**
 * Bir hesaba BU işletmeye erişim verir.
 *
 * Yetki hedef işletmedeki `ekip.yonet` — yani erişimi veren kişi, erişimi
 * verdiği işletmenin ekibini yönetebiliyor olmalı. Kendi işletmesinde sahip
 * olmak yetmez; aksi hâlde bir ortak, diğerinin işletmesine kendi kendine
 * erişim verebilirdi.
 *
 * Hesap E-POSTAYLA bulunuyor, kimlikle değil: erişim veren kişi karşı tarafın
 * iç kimliğini bilmez, e-postasını bilir. Bulunamadığında da "bu e-postayla
 * hesap yok" deniyor — hesabın varlığını gizlemenin bir anlamı yok, zaten
 * erişim vermeye çalışılan kişi tanıdık.
 */
export async function grantMembershipAction(
  _prev: MembershipState,
  formData: FormData
): Promise<MembershipState> {
  const session = await requireCapability('ekip.yonet');
  if (!session) return { error: 'Bu işlem için ekip yönetimi yetkisi gerekir.' };

  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const role = String(formData.get('role') ?? '');

  if (!email) return { error: 'E-posta girin.' };
  if (!isOperatorRole(role)) return { error: 'Geçerli bir rol seçin.' };

  const user = await getOperatorUserByEmail(email);
  if (!user) return { error: 'Bu e-postayla bir işletme hesabı bulunamadı.' };

  const result = await grantMembership({
    operatorUserId: user.id,
    operatorId: session.operator.id,
    role,
    grantedBy: session.user.id,
  });

  if (!result.ok) {
    if (result.reason === 'already_primary') {
      return { error: 'Bu hesap zaten bu işletmenin kendi personeli.' };
    }
    return { error: 'Erişim verilemedi.' };
  }

  await record({
    action: 'operator_user.membership_granted',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: session.operator.id,
    targetType: 'operator_user',
    targetId: user.id,
    ...(await requestContext()),
    meta: { role },
  });

  revalidatePath('/isletme/ekip');
  return { message: `${user.name} bu işletmeye erişebilir.` };
}

export async function revokeMembershipAction(
  _prev: MembershipState,
  formData: FormData
): Promise<MembershipState> {
  const session = await requireCapability('ekip.yonet');
  if (!session) return { error: 'Bu işlem için ekip yönetimi yetkisi gerekir.' };

  const operatorUserId = String(formData.get('operatorUserId') ?? '');
  if (!operatorUserId) return { error: 'Hesap seçilmedi.' };

  const removed = await revokeMembership(operatorUserId, session.operator.id);
  if (!removed) return { error: 'Bu hesabın zaten erişimi yok.' };

  await record({
    action: 'operator_user.membership_revoked',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: session.operator.id,
    targetType: 'operator_user',
    targetId: operatorUserId,
    ...(await requestContext()),
    meta: null,
  });

  revalidatePath('/isletme/ekip');
  return { message: 'Erişim kaldırıldı.' };
}

/** Üst çubuktaki seçicinin seçenekleri. */
export async function switcherOptions(operatorUserId: string) {
  return listMemberships(operatorUserId);
}
