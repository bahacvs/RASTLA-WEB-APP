import { redirect } from 'next/navigation';
import { getAgencyUserId } from './session';
import { getAgency, getAgencyUser, type Agency, type AgencyUser } from './db/agencies';

/**
 * Acente portalının yetki kapısı.
 *
 * `lib/auth.ts` ve `lib/platform-auth.ts` ile aynı deseni izliyor ama **ayrı
 * bir dosya**, ve bu bilinçli: üç alanın yetkileri kesişmiyor ve tek dosyada
 * toplansaydı bir yerde yanlış fonksiyonu çağırmak (`requireCapability` yerine
 * `requireAgency`) acente personeline işletme paneli açardı. Ayrı dosya, ayrı
 * tip, ayrı çerez: bu hatayı tip denetleyicisi yakalıyor.
 *
 * **Acente oturumu `/isletme` ve `/yonetim` için hiçbir şey ifade etmiyor** —
 * o sayfalar başka çerezlere bakıyor ve bu ayrım yapısal, bir kontrol
 * meselesi değil.
 */

export type AgencySession = { user: AgencyUser; agency: Agency };

export async function currentAgency(): Promise<AgencySession | null> {
  const id = await getAgencyUserId();
  if (!id) return null;

  const user = await getAgencyUser(id);
  if (!user || user.status !== 'active') return null;

  // ACENTENİN durumu da her istekte soruluyor, yalnızca hesabınki değil: bir
  // otelle çalışmayı bırakmak, o otelin her hesabını tek tek kapatmayı
  // gerektirmemeli ve askı anında etkili olmalı.
  const agency = await getAgency(user.agencyId);
  if (!agency || agency.status !== 'active') return null;

  return { user, agency };
}

/**
 * Korumalı acente sayfalarının ilk satırı.
 *
 * `redirect()` fırlattığı için dönüş tipi null içermiyor.
 */
export async function requireAgencyPage(): Promise<AgencySession> {
  const session = await currentAgency();
  if (!session) redirect('/acente');
  return session;
}
