import { redirect } from 'next/navigation';
import { getPlatformUserId } from './session';
import {
  getPlatformUser,
  platformRoleCan,
  type PlatformCapability,
  type PlatformUser,
} from './db/platform';

/**
 * RASTLA operasyon panelinin yetki kapısı.
 *
 * `lib/auth.ts` ile aynı deseni izliyor ama **ayrı bir dosya**, ve bu bilinçli:
 * iki alanın yetkileri kesişmiyor ve tek dosyada toplansaydı bir yerde yanlış
 * fonksiyonu çağırmak (`requireCapability` yerine `requirePlatform`) işletme
 * personeline yönetim paneli açardı. Ayrı dosya, ayrı tip, ayrı çerez: bu
 * hatayı tip denetleyicisi yakalıyor.
 */

export async function currentPlatformUser(): Promise<PlatformUser | null> {
  const id = await getPlatformUserId();
  if (!id) return null;

  const user = await getPlatformUser(id);
  // Askıya alınmış hesabın elindeki çerez anında geçersiz: yetki her istekte
  // veritabanından türetiliyor, çerezden değil.
  return user && user.status === 'active' ? user : null;
}

export function platformCan(
  user: PlatformUser | null,
  capability: PlatformCapability
): boolean {
  return user ? platformRoleCan(user.role, capability) : false;
}

/** Sunucu eylemlerinin ilk satırı. */
export async function requirePlatform(
  capability: PlatformCapability
): Promise<PlatformUser | null> {
  const user = await currentPlatformUser();
  return platformCan(user, capability) ? user : null;
}

/**
 * Korumalı yönetim sayfalarının ilk satırı.
 *
 * Oturum yoksa girişe, yetki yoksa panelin ana ekranına yönlendirir.
 */
export async function requirePlatformPage(
  capability: PlatformCapability
): Promise<PlatformUser> {
  const user = await currentPlatformUser();
  if (!user) redirect('/yonetim');
  if (!platformCan(user, capability)) redirect('/yonetim/isletmeler');
  return user;
}
