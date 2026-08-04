import Link from 'next/link';
import { operatorLogoutAction } from '@/app/actions/operator';

const LINKS = [
  { href: '/isletme/tara', label: 'Bilet Okut' },
  { href: '/isletme/aktiviteler', label: 'Aktiviteler' },
  { href: '/isletme/rezervasyonlar', label: 'Rezervasyonlar' },
];

/** İşletme panelinin ortak üst çubuğu. */
export function OperatorNav({ operatorName }: { operatorName: string }) {
  return (
    <header className="border-b border-surface-variant bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-container-margin">
        <div className="min-w-0">
          <p className="text-label-sm text-on-surface-variant">İşletme</p>
          <p className="truncate text-body-md font-semibold text-on-surface">{operatorName}</p>
        </div>
        <form action={operatorLogoutAction}>
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
          </Link>
        ))}
      </nav>
    </header>
  );
}
