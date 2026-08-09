import Link from 'next/link';
import { platformLogoutAction } from '@/app/actions/platform';
import {
  platformRoleCan,
  PLATFORM_ROLE_LABELS,
  type PlatformCapability,
  type PlatformUser,
} from '@/lib/db/platform';

/**
 * RASTLA operasyon panelinin üst çubuğu.
 *
 * İşletme panelinin çubuğundan görsel olarak AYRILIYOR (koyu zemin): iki panel
 * aynı tarayıcıda açıkken hangisinde olunduğunun bir bakışta anlaşılması
 * gerekiyor. Yanlış panelde olduğunu fark etmeden komisyon değiştirmek,
 * geri alınması pahalı bir hata.
 */
const LINKS: { href: string; label: string; needs: PlatformCapability }[] = [
  { href: '/yonetim/isletmeler', label: 'İşletmeler', needs: 'isletme.goruntule' },
  { href: '/yonetim/ilanlar', label: 'İlan İncelemesi', needs: 'ilan.incele' },
  { href: '/yonetim/acenteler', label: 'Acenteler', needs: 'acente.yonet' },
];

export function PlatformNav({ user }: { user: PlatformUser }) {
  const links = LINKS.filter(({ needs }) => platformRoleCan(user.role, needs));

  return (
    <header className="bg-on-surface">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-container-margin">
        <div className="min-w-0">
          <p className="truncate text-body-md font-semibold text-surface">RASTLA Yönetim</p>
          <p className="truncate text-label-sm text-surface-variant">
            {user.name} · {PLATFORM_ROLE_LABELS[user.role]}
          </p>
        </div>
        <form action={platformLogoutAction}>
          <button type="submit" className="text-label-bold text-surface-variant hover:underline">
            Çıkış
          </button>
        </form>
      </div>

      <nav className="scrollbar-hide mx-auto flex w-full max-w-7xl gap-sm overflow-x-auto px-container-margin pb-sm">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="rounded-full border border-outline px-4 py-2 text-label-bold whitespace-nowrap text-surface hover:bg-outline"
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
