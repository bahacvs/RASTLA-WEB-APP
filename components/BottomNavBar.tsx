'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './Icon';

/**
 * `href` tanımlı olmayan sekmeler bu fazda henüz uygulanmadı; prototipteki
 * gibi hiçbir şey yapmayan butonlar olarak çizilirler (404'e götürmezler).
 */
const ITEMS: { label: string; icon: IconName; href?: string }[] = [
  { label: 'Ana Sayfa', icon: 'home', href: '/' },
  { label: 'Ara', icon: 'search', href: '/ara' },
  { label: 'Rezervasyonlar', icon: 'calendar_today' },
  { label: 'Profil', icon: 'person' },
];

const ACTIVE =
  'flex flex-col items-center justify-center rounded-full bg-secondary-container px-4 py-1 text-on-secondary-container transition-all duration-200 active:scale-90';
const IDLE =
  'flex flex-col items-center justify-center px-4 py-1 text-on-surface-variant transition-all duration-200 hover:text-primary active:scale-90';

/**
 * Mobilde kalıcı alt navigasyon. Aktif sekme rotadan türetilir — prototipte
 * her sayfada elle işaretlenmişti.
 */
export function BottomNavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-xl border-t border-outline-variant bg-surface px-4 pt-2 pb-4 shadow-card-top md:hidden">
      {ITEMS.map(({ href, label, icon }) => {
        const active = href ? (href === '/' ? pathname === '/' : pathname.startsWith(href)) : false;
        const body = (
          <>
            <Icon name={icon} filled={active} />
            <span className="mt-1 text-label-bold">{label}</span>
          </>
        );

        return href ? (
          <Link
            key={label}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={active ? ACTIVE : IDLE}
          >
            {body}
          </Link>
        ) : (
          <button key={label} type="button" className={IDLE}>
            {body}
          </button>
        );
      })}
    </nav>
  );
}
