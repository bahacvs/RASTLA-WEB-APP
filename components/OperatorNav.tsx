import Link from 'next/link';
import { operatorLogoutAction } from '@/app/actions/operator';
import { roleCan, ROLE_LABELS, type Capability } from '@/lib/permissions';
import type { OperatorSession } from '@/lib/auth';

/**
 * Menü, kişinin yeteneklerine göre daralır.
 *
 * Her bağlantı hangi yeteneği gerektirdiğini yanında taşıyor; önce "sahip mi
 * değil mi" diye iki listeye bölünmüştü ve üçüncü rol gelince o ayrım
 * yöneticiyi saha personeliyle aynı kefeye koyuyordu.
 *
 * DİKKAT — bu liste **yetkilendirme değil.** Bağlantıyı gizlemek sayfayı
 * korumaz; asıl engel her sayfanın başındaki `requireOperatorPage` ve her
 * sunucu eyleminin başındaki `requireCapability` çağrısıdır. Buradaki filtre
 * yalnızca kişiye giremeyeceği kapıları göstermemek için.
 */
const LINKS: { href: string; label: string; needs: Capability }[] = [
  { href: '/isletme/bugun', label: 'Bugün', needs: 'bugun.goruntule' },
  { href: '/isletme/tara', label: 'Bilet Okut', needs: 'checkin.yap' },
  { href: '/isletme/rezervasyonlar', label: 'Rezervasyonlar', needs: 'rezervasyon.goruntule' },
  { href: '/isletme/aktiviteler', label: 'Aktiviteler', needs: 'aktivite.yonet' },
  { href: '/isletme/odeme-ayarlari', label: 'Ödeme', needs: 'odeme.yonet' },
  { href: '/isletme/ekip', label: 'Ekip', needs: 'ekip.yonet' },
  { href: '/isletme/gunluk', label: 'İşlem Günlüğü', needs: 'gunluk.goruntule' },
];

/** İşletme panelinin ortak üst çubuğu. */
export function OperatorNav({ session }: { session: OperatorSession }) {
  const links = LINKS.filter(({ needs }) => roleCan(session.user.role, needs));

  return (
    <header className="border-b border-surface-variant bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-container-margin">
        <div className="min-w-0">
          <p className="truncate text-body-md font-semibold text-on-surface">
            {session.operator.name}
          </p>
          <p className="truncate text-label-sm text-on-surface-variant">
            {session.user.name} · {ROLE_LABELS[session.user.role]}
          </p>
        </div>
        <form action={operatorLogoutAction}>
          <button type="submit" className="text-label-bold text-on-surface-variant hover:underline">
            Çıkış
          </button>
        </form>
      </div>

      <nav className="scrollbar-hide mx-auto flex w-full max-w-7xl gap-sm overflow-x-auto px-container-margin pb-sm">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="rounded-full border border-outline-variant px-4 py-2 text-label-bold whitespace-nowrap text-on-surface-variant hover:bg-surface-container-low"
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
