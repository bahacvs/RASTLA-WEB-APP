import Link from 'next/link';
import type { Branch } from '@/lib/db/branches';

/**
 * Şube süzgeci — adreste taşınıyor, istemci durumunda değil.
 *
 * Süzülmüş bir görünümün paylaşılabilir ve yenilenebilir olması gerekiyor:
 * sahadaki personel "Silivri'nin bugünü" bağlantısını telefonuna kaydedebilmeli
 * ve sayfayı yenilediğinde aynı şeyi görmeli.
 *
 * **Şube tanımlamamış işletmede hiç çizilmiyor.** Tek seçeneği olan bir süzgeç,
 * ekranda yer kaplamaktan başka bir şey yapmaz.
 *
 * Bu bir YETKİ SINIRI DEĞİL: personel süzgeci kaldırıp işletmenin tamamını
 * görebilir. Gerçek bir sınır gerekiyorsa rol sisteminde tanımlanmalı; süzgeci
 * yetki gibi göstermek olmayan bir güvence vaat etmek olurdu.
 */
export function BranchFilter({
  branches,
  activeId,
  basePath,
  extraParams,
}: {
  branches: Branch[];
  activeId: string | null;
  basePath: string;
  /** Korunacak diğer sorgu parametreleri (örneğin seçili gün). */
  extraParams?: Record<string, string | undefined>;
}) {
  if (branches.length === 0) return null;

  const href = (branchId: string | null) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(extraParams ?? {})) {
      if (value) params.set(key, value);
    }
    if (branchId) params.set('sube', branchId);
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  const chip = (active: boolean) =>
    `rounded-full px-3 py-2 text-label-bold whitespace-nowrap ${
      active
        ? 'bg-primary text-on-primary'
        : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-low'
    }`;

  return (
    <nav aria-label="Şube süzgeci" className="scrollbar-hide flex gap-2 overflow-x-auto">
      <Link href={href(null)} className={chip(activeId === null)}>
        Tüm şubeler
      </Link>
      {branches.map((branch) => (
        <Link key={branch.id} href={href(branch.id)} className={chip(activeId === branch.id)}>
          {branch.name}
        </Link>
      ))}
    </nav>
  );
}
