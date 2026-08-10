/**
 * İskelet ekran parçaları.
 *
 * Dönen bir çark yerine sayfanın kabası çiziliyor: kullanıcı ne geleceğini
 * görüyor ve bekleme daha kısa hissediliyor. Ölçüler gerçek ekranlara yakın
 * tutuldu — iskeletle gelen içeriğin boyu tutmazsa sayfa gözün önünde
 * zıplıyor ve kazanılan his geri veriliyor.
 *
 * Sunucu bileşeni: `'use client'` yok. Animasyon saf CSS, davranış yok.
 */

export function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`h-4 animate-pulse rounded bg-surface-container ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
      <SkeletonLine className="mb-sm w-1/3" />
      <SkeletonLine className="mb-2 w-full" />
      <SkeletonLine className="w-2/3" />
    </div>
  );
}

/** Panel ekranlarının ortak iskeleti: başlık, sayı kutuları, liste. */
export function PanelSkeleton({ tiles = 5, rows = 4 }: { tiles?: number; rows?: number }) {
  return (
    <main
      // Bekleme durumu ekran okuyucuya da bildiriliyor; dönen kutular
      // yalnızca gözle görülüyor.
      role="status"
      aria-label="Sayfa yükleniyor"
      className="mx-auto flex max-w-[60rem] flex-col gap-lg px-container-margin py-lg"
    >
      <div>
        <SkeletonLine className="mb-2 h-7 w-40" />
        <SkeletonLine className="w-56" />
      </div>

      {tiles > 0 && (
        <div className="grid grid-cols-2 gap-sm sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: tiles }, (_, i) => (
            <div
              key={i}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md"
            >
              <SkeletonLine className="mb-2 w-2/3" />
              <SkeletonLine className="h-6 w-1/2" />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-sm">
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </main>
  );
}
