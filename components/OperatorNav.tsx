import Link from 'next/link';
import { operatorLogoutAction } from '@/app/actions/operator';
import type { OperatorSession } from '@/lib/auth';

// Personelin işi: bilet okutmak ve o günün listesini görmek.
const LINKS = [
  { href: '/isletme/tara', label: 'Bilet Okut' },
  { href: '/isletme/rezervasyonlar', label: 'Rezervasyonlar' },
];

// Fiyat, takvim, ekip ve denetim kaydı ticari kararlardır; sahibe ayrılmıştır.
// Menüyü gizlemek yetkilendirme değildir — kontrol ayrıca sunucuda yapılır.
const OWNER_LINKS = [
  { href: '/isletme/aktiviteler', label: 'Aktiviteler' },
  { href: '/isletme/ekip', label: 'Ekip' },
  { href: '/isletme/gunluk', label: 'İşlem Günlüğü' },
];

/** İşletme panelinin ortak üst çubuğu. */
export function OperatorNav({ session }: { session: OperatorSession }) {
  const links = session.user.role === 'owner' ? [...LINKS, ...OWNER_LINKS] : LINKS;

  return (
    <header className="border-b border-surface-variant bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-container-margin">
        <div className="min-w-0">
          <p className="truncate text-body-md font-semibold text-on-surface">
            {session.operator.name}
          </p>
          <p className="truncate text-label-sm text-on-surface-variant">
            {session.user.name} · {session.user.role === 'owner' ? 'Sahip' : 'Personel'}
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
