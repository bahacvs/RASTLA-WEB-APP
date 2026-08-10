import Link from 'next/link';
import { LinkPending, LinkPendingAnnouncement } from '@/components/Pending';
import { agencyLogoutAction } from '@/app/actions/agency';
import type { AgencySession } from '@/lib/agency-auth';

/**
 * Acente portalının üst çubuğu.
 *
 * İki bağlantı: müsaitlik ve kendi rezervasyonları. Rol ayrımı yok çünkü
 * acente personelinin yapabileceği tek şey misafir adına yer tutmak ve kendi
 * tuttuğu yeri iptal etmek — bölünecek bir yetki yok.
 */
const LINKS = [
  { href: '/acente/ara', label: 'Müsaitlik' },
  { href: '/acente/rezervasyonlarim', label: 'Rezervasyonlarım' },
];

export function AgencyNav({ session }: { session: AgencySession }) {
  return (
    <header className="border-b border-surface-variant bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-container-margin">
        <div className="min-w-0">
          <p className="truncate text-body-md font-semibold text-on-surface">
            {session.agency.name}
          </p>
          <p className="truncate text-label-sm text-on-surface-variant">
            {session.user.name} · Acente
          </p>
        </div>
        <form action={agencyLogoutAction}>
          <button type="submit" className="text-label-bold text-on-surface-variant hover:underline">
            Çıkış
          </button>
        </form>
      </div>

      <nav className="scrollbar-hide mx-auto flex w-full max-w-7xl gap-sm overflow-x-auto px-container-margin pb-sm">
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="rounded-full border border-outline-variant px-4 py-2 text-label-bold whitespace-nowrap text-on-surface-variant hover:bg-surface-container-low"
          >
            {label}
            <LinkPending />
            <LinkPendingAnnouncement />
          </Link>
        ))}
      </nav>
    </header>
  );
}
