import { redirect } from 'next/navigation';
import { getActiveOperator, getOperatorUserId, getUserId } from './session';
import { getOperator, getOperatorUser, type Operator, type OperatorUser } from './db/operators';
import { getUser } from './db/users';
import { roleAt } from './db/memberships';
import { roleCan, type Capability, type OperatorRole } from './permissions';

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

/**
 * `user.role` SEÇİLİ İŞLETMEDEKİ roldür, hesabın ana rolü değil.
 *
 * Kendi işletmesinde sahip olan biri ortağının işletmesinde saha personeli
 * olabiliyor (bkz. lib/db/memberships.ts). Rolü hesaptan okumaya devam
 * etseydik, ortağın panelinde kendi işletmesindeki yetkiyle dolaşırdı — ve
 * bunu fark etmenin tek yolu para ekranını açıp görmek olurdu.
 *
 * `primaryOperatorId` ayrıca taşınıyor: arayüz "burası sizin işletmeniz değil"
 * uyarısını buna bakarak gösteriyor.
 */
export type OperatorSession = {
  user: OperatorUser;
  operator: Operator;
  primaryOperatorId: string;
};

export async function currentOperator(): Promise<OperatorSession | null> {
  const userId = await getOperatorUserId();
  if (!userId) return null;

  const user = await getOperatorUser(userId);
  if (!user || user.status !== 'active') return null;

  // Çerez yalnızca TERCİH taşıyor. Üyelik her istekte veritabanından
  // doğrulanıyor: erişim dün verilip bugün geri alınmış olabilir ve imzalı bir
  // çerez bunu bilemez. Doğrulanamayan seçim sessizce ana işletmeye düşer —
  // hata sayfası göstermek, erişimi kaldırılan kişiyi panelin dışında
  // bırakmak olurdu; oysa kendi işletmesi hâlâ orada.
  const selected = await getActiveOperator();
  const role: OperatorRole | null =
    selected && selected !== user.operatorId ? await roleAt(user.id, selected) : null;

  const operatorId = role ? selected! : user.operatorId;
  const operator = await getOperator(operatorId);
  if (!operator) return null;

  return {
    user: role ? { ...user, operatorId, role } : user,
    operator,
    primaryOperatorId: user.operatorId,
  };
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
  if (!session) return '/isletme';
  return can(session, 'bugun.goruntule') ? '/isletme/bugun' : '/isletme/tara';
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
