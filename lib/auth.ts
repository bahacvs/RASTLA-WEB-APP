import { redirect } from 'next/navigation';
import { getOperatorUserId, getUserId } from './session';
import { getOperator, getOperatorUser, type Operator, type OperatorUser } from './db/operators';
import { getUser } from './db/users';
import { roleCan, type Capability } from './permissions';

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

/**
 * Yetki kontrolü — rol karşılaştırması yerine yetenek sorgusu.
 *
 * Önce her yerde `session.user.role !== 'owner'` yazıyordu ve bu, üçüncü bir
 * rol eklenemez hâle getirmişti: "sahip değilse yasak" kuralı yöneticiyi de
 * saha personeliyle aynı kefeye koyuyordu. Yetenek sorulunca rol eklemek
 * yalnızca lib/permissions.ts'i değiştirmek oluyor.
 */
export function can(session: OperatorSession | null, capability: Capability): boolean {
  return session ? roleCan(session.user.role, capability) : false;
}

/**
 * Oturumu çözer ve yeteneği doğrular; biri eksikse null döner.
 *
 * Sunucu eylemlerinin ilk satırı bu olmalı. Arayüzde düğmeyi gizlemek yeterli
 * değil — sunucu eylemleri adresi bilen herkese açıktır ve doğrulama testleri
 * tam olarak bunu, arayüzü atlayarak sınıyor.
 */
export async function requireCapability(
  capability: Capability
): Promise<OperatorSession | null> {
  const session = await currentOperator();
  return can(session, capability) ? session : null;
}

/**
 * Rolüne göre kişinin gideceği ilk ekran.
 *
 * Tek yerde duruyor çünkü her yetkisiz yönlendirme buraya düşüyor; sabit
 * yazılsaydı ekran adı değiştiğinde bir kısmı geride kalırdı.
 */
export function operatorHome(session: OperatorSession | null): string {
  // Bugün ekranı açıldığında burası '/isletme/bugun' olacak — tek satır.
  return session ? '/isletme/tara' : '/isletme';
}

/**
 * Korumalı sunucu bileşenlerinin ilk satırı.
 *
 * Oturum yoksa girişe, yetki yoksa kişinin kendi ana ekranına yönlendirir —
 * yetkisiz birine 404 göstermek "böyle bir sayfa yok" demek olurdu ve yanlış
 * bilgi verirdi; oysa sayfa var, kişi giremiyor.
 *
 * `redirect()` fırlattığı için dönüş tipi null içermiyor: çağıran taraf
 * oturumu doğrudan kullanabilir.
 */
export async function requireOperatorPage(capability: Capability): Promise<OperatorSession> {
  const session = await currentOperator();
  if (!session) redirect('/isletme');
  if (!can(session, capability)) redirect(operatorHome(session));
  return session;
}
