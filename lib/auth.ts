import { getOperatorUserId, getUserId } from './session';
import { getOperator, getOperatorUser, type Operator, type OperatorUser } from './db/operators';
import { getUser } from './db/users';

/**
 * Oturumdaki misafirin kimliği — silinmiş hesaplar hariç.
 *
 * Çerez 90 gün geçerli ve imzası hesap silinince de bozulmaz. Yalnızca
 * `getUserId()` kullanılsaydı, hesabını silen birinin başka bir cihazda kalmış
 * çerezi rezervasyon geçmişini açmaya devam ederdi. Silme talebi karşılandıysa
 * o oturum da bitmiş sayılır.
 */
export async function currentUserId(): Promise<string | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const user = await getUser(userId);
  return user && !user.deletedAt ? user.id : null;
}

/**
 * Oturumdaki işletme personelini çözer.
 *
 * Çerez kişinin kimliğini taşır; işletme kimliği her istekte veritabanından
 * türetilir. Çereze yazılmamasının sebebi şu: hesap askıya alındığında ya da
 * başka bir işletmeye taşındığında elindeki çerez geçerliliğini anında
 * yitirsin. Çereze gömülü olsaydı 90 gün boyunca geçerli kalırdı.
 */

export type OperatorSession = { user: OperatorUser; operator: Operator };

export async function currentOperator(): Promise<OperatorSession | null> {
  const userId = await getOperatorUserId();
  if (!userId) return null;

  const user = await getOperatorUser(userId);
  if (!user || user.status !== 'active') return null;

  const operator = await getOperator(user.operatorId);
  if (!operator) return null;

  return { user, operator };
}

/** Yalnızca işletme kimliği gerektiğinde. */
export async function currentOperatorId(): Promise<string | null> {
  return (await currentOperator())?.operator.id ?? null;
}

export function isOwner(session: OperatorSession | null): boolean {
  return session?.user.role === 'owner';
}
