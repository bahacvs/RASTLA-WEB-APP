import { getOperatorUserId } from './session';
import { getOperator, getOperatorUser, type Operator, type OperatorUser } from './db/operators';

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

  const user = getOperatorUser(userId);
  if (!user || user.status !== 'active') return null;

  const operator = getOperator(user.operatorId);
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
