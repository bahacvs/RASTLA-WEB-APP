'use server';

import { revalidatePath } from 'next/cache';
import { currentOperator } from '@/lib/auth';
import {
  checkPassword,
  createOperatorUser,
  getOperatorUser,
  setOperatorUserStatus,
  setPassword,
  type OperatorRole,
} from '@/lib/db/operators';
import { generatePassword, passwordProblem } from '@/lib/password.mjs';

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

async function requireOwner() {
  const session = await currentOperator();
  return session?.user.role === 'owner' ? session : null;
}

/** Hedef hesabın çağıranla aynı işletmede olduğunu doğrular. */
async function requireSameOperator(userId: string) {
  const session = await requireOwner();
  if (!session) return null;

  const target = getOperatorUser(userId);
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
  const role: OperatorRole = formData.get('role') === 'owner' ? 'owner' : 'staff';

  if (name.length < 2) return { error: 'Ad soyad girin.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Geçerli bir e-posta girin.' };

  // Parolayı sahip belirlemez, sistem üretir. Sahibin seçeceği parola hem zayıf
  // olur hem de sahip tarafından bilinmeye devam ederdi; hesabın kişiye ait
  // olmasının anlamı kalmazdı.
  const password = generatePassword();
  const result = createOperatorUser({
    operatorId: session.operator.id,
    email,
    name,
    password,
    role,
  });

  if (!result.ok) {
    return result.reason === 'email_taken'
      ? { error: 'Bu e-posta ile bir hesap zaten var.' }
      : { error: 'İşletme bulunamadı.' };
  }

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
  setPassword(owned.target.id, password);

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

  const result = setOperatorUserStatus(owned.target.id, status);
  if (!result.ok) {
    return result.reason === 'last_owner'
      ? { error: 'İşletmenin son etkin sahibi askıya alınamaz.' }
      : { error: 'Hesap bulunamadı.' };
  }

  revalidatePath('/isletme/ekip');
  return {
    message:
      status === 'suspended'
        ? `${owned.target.name} askıya alındı; oturumu anında geçersiz oldu.`
        : `${owned.target.name} yeniden etkinleştirildi.`,
  };
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

  if (!checkPassword(session.user.id, current)) {
    return { error: 'Mevcut parola hatalı.' };
  }
  if (password !== repeat) return { error: 'Yeni parolalar aynı değil.' };

  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  setPassword(session.user.id, password);
  return { message: 'Parolanız değiştirildi.' };
}
