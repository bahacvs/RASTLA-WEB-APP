'use server';

import { revalidatePath } from 'next/cache';
import { currentOperator } from '@/lib/auth';
import {
  checkPassword,
  createOperatorUser,
  getOperatorUser,
  setOperatorUserPhone,
  setOperatorUserStatus,
  setPassword,
  type OperatorRole,
} from '@/lib/db/operators';
import { normalizePhone } from '@/lib/db/users';
import { maskPhone } from '@/lib/sms';
import { generatePassword, passwordProblem } from '@/lib/password.mjs';
import { record, type AuditAction } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';
import type { OperatorSession } from '@/lib/auth';

/**
 * İşletme sahibinin ekip yönetimi.
 *
 * Her eylem iki şeyi doğrular: çağıranın sahip olduğu VE hedef hesabın aynı
 * işletmeye ait olduğu. İkincisi olmadan bir sahip, kimliğini bildiği başka
 * işletmenin hesabını askıya alabilirdi.
 */

export type TeamState = {
  error?: string;
  message?: string;
  /**
   * Yeni oluşturulan hesabın geçici parolası. Yalnızca bir kez, oluşturma
   * cevabında döner; veritabanında yalnızca özeti saklandığı için geri
   * getirilemez. Kaybolursa yeni parola üretilir.
   */
  password?: string;
};

/** Ekip değişikliklerini günlüğe yazar. */
async function log(
  session: OperatorSession,
  action: AuditAction,
  targetUserId: string,
  meta?: Record<string, unknown>
) {
  await record({
    action,
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: session.operator.id,
    targetType: 'operator_user',
    targetId: targetUserId,
    ...(await requestContext()),
    meta: meta ?? null,
  });
}

async function requireOwner() {
  const session = await currentOperator();
  return session?.user.role === 'owner' ? session : null;
}

/** Hedef hesabın çağıranla aynı işletmede olduğunu doğrular. */
async function requireSameOperator(userId: string) {
  const session = await requireOwner();
  if (!session) return null;

  const target = await getOperatorUser(userId);
  if (!target || target.operatorId !== session.operator.id) return null;

  return { session, target };
}

export async function createTeamMemberAction(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const session = await requireOwner();
  if (!session) return { error: 'Bu işlem için işletme sahibi yetkisi gerekir.' };

  const email = String(formData.get('email') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  const role: OperatorRole = formData.get('role') === 'owner' ? 'owner' : 'staff';

  if (name.length < 2) return { error: 'Ad soyad girin.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Geçerli bir e-posta girin.' };
  // Telefon zorunlu: ikinci faktör oraya gidiyor. Numarasız bir hesap açmak,
  // hesabı tek katmanlı bırakmak demek olurdu.
  if (phone.length < 12) return { error: 'Geçerli bir cep telefonu girin (ikinci faktör buraya gider).' };

  // Parolayı sahip belirlemez, sistem üretir. Sahibin seçeceği parola hem zayıf
  // olur hem de sahip tarafından bilinmeye devam ederdi; hesabın kişiye ait
  // olmasının anlamı kalmazdı.
  const password = generatePassword();
  const result = await createOperatorUser({
    operatorId: session.operator.id,
    email,
    name,
    phone,
    password,
    role,
  });

  if (!result.ok) {
    return result.reason === 'email_taken'
      ? { error: 'Bu e-posta ile bir hesap zaten var.' }
      : { error: 'İşletme bulunamadı.' };
  }

  // Üretilen parola günlüğe YAZILMAZ; yalnızca hesabın açıldığı kaydedilir.
  // Telefon numarası günlüğe maskelenerek yazılır; kaydın kimi işaret ettiği
  // zaten belli, tam numarayı ikinci bir yerde çoğaltmanın anlamı yok.
  await log(session, 'operator_user.created', result.user.id, {
    email: result.user.email,
    role: result.user.role,
    phone: maskPhone(phone),
  });

  revalidatePath('/isletme/ekip');
  return {
    message: `${result.user.name} eklendi. Parolayı kişiye iletin — bu ekran kapandığında bir daha gösterilemez.`,
    password,
  };
}

export async function resetTeamPasswordAction(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const owned = await requireSameOperator(String(formData.get('userId') ?? ''));
  if (!owned) return { error: 'Bu hesaba erişim yetkiniz yok.' };

  const password = generatePassword();
  await setPassword(owned.target.id, password);
  await log(owned.session, 'operator_user.password_reset', owned.target.id, {
    email: owned.target.email,
  });

  revalidatePath('/isletme/ekip');
  return {
    message: `${owned.target.name} için yeni parola üretildi. Kişiye iletin.`,
    password,
  };
}

export async function setTeamStatusAction(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const owned = await requireSameOperator(String(formData.get('userId') ?? ''));
  if (!owned) return { error: 'Bu hesaba erişim yetkiniz yok.' };

  const status = formData.get('status') === 'suspended' ? 'suspended' : 'active';

  // Kendi hesabını askıya almak kişiyi anında dışarıda bırakırdı.
  if (status === 'suspended' && owned.target.id === owned.session.user.id) {
    return { error: 'Kendi hesabınızı askıya alamazsınız.' };
  }

  const result = await setOperatorUserStatus(owned.target.id, status);
  if (!result.ok) {
    return result.reason === 'last_owner'
      ? { error: 'İşletmenin son etkin sahibi askıya alınamaz.' }
      : { error: 'Hesap bulunamadı.' };
  }

  await log(
    owned.session,
    status === 'suspended' ? 'operator_user.suspended' : 'operator_user.reactivated',
    owned.target.id,
    { email: owned.target.email }
  );

  revalidatePath('/isletme/ekip');
  return {
    message:
      status === 'suspended'
        ? `${owned.target.name} askıya alındı; oturumu anında geçersiz oldu.`
        : `${owned.target.name} yeniden etkinleştirildi.`,
  };
}

/**
 * Numarası olmayan bir hesaba ikinci faktör numarası ekler.
 *
 * Bu özellikten önce açılmış hesaplar numarasız; onları girişte kilitlemek
 * çalışan bir işletmeyi sahada dışarıda bırakmak olurdu. Bunun yerine ekip
 * ekranı yüksek sesle uyarıyor ve numara buradan tamamlanıyor.
 */
export async function setTeamPhoneAction(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const owned = await requireSameOperator(String(formData.get('userId') ?? ''));
  if (!owned) return { error: 'Bu hesaba erişim yetkiniz yok.' };

  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  if (phone.length < 12) return { error: 'Geçerli bir cep telefonu girin.' };

  await setOperatorUserPhone(owned.target.id, phone);
  await log(owned.session, 'operator_user.phone_set', owned.target.id, {
    email: owned.target.email,
    phone: maskPhone(phone),
  });

  revalidatePath('/isletme/ekip');
  return { message: `${owned.target.name} için ikinci faktör numarası kaydedildi.` };
}

/**
 * Parolasını değiştirmek her hesabın kendi hakkı; sahip yetkisi gerekmez.
 *
 * Mevcut parola ayrıca sorulur. Sorulmasaydı çalınmış bir oturum çerezi, asıl
 * sahibi kendi hesabından kilitlemeye yeterdi.
 */
export async function changeOwnPasswordAction(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const session = await currentOperator();
  if (!session) return { error: 'Oturum sona ermiş.' };

  const current = String(formData.get('current') ?? '');
  const password = String(formData.get('password') ?? '');
  const repeat = String(formData.get('repeat') ?? '');

  if (!await checkPassword(session.user.id, current)) {
    return { error: 'Mevcut parola hatalı.' };
  }
  if (password !== repeat) return { error: 'Yeni parolalar aynı değil.' };

  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  await setPassword(session.user.id, password);
  await record({
    action: 'operator.password_changed',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: session.operator.id,
    targetType: 'operator_user',
    targetId: session.user.id,
    ...(await requestContext()),
  });

  return { message: 'Parolanız değiştirildi.' };
}
