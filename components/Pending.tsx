'use client';

import { useLinkStatus } from 'next/link';

/**
 * Tıklanan bağlantının "gidiyorum" göstergesi.
 *
 * Neden var: bu uygulamanın ekranlarının çoğu `force-dynamic` ve her biri
 * veritabanına gidiyor. App Router'da dinamik bir sayfaya giden `<Link>`,
 * sunucu cevap verene kadar ekranda **hiçbir şeyi değiştirmiyor** — imleç
 * bile. Kullanıcı doğal olarak "tıklamadım galiba" deyip tekrar basıyor.
 *
 * `useLinkStatus` yalnızca `<Link>` ALTINDA çalışıyor; bu yüzden ayrı bir
 * bileşen ve bağlantının içine konuyor. Sunucudan cevap beklenirken görünür,
 * yeni sayfa çizilince kendiliğinden kayboluyor.
 *
 * Boyut `1em`: yanındaki metnin punto'suna uyuyor, düzeni bozmuyor.
 */
export function LinkPending({ className = '' }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      aria-hidden
      className={`ml-1 inline-block h-[1em] w-[1em] shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.125em] opacity-70 ${className}`}
    />
  );
}

/**
 * Ekran okuyucular için: gezinme başladığında duyurulur.
 *
 * Dönen halka görsel; klavye ve ekran okuyucu kullanan biri için hiçbir şey
 * ifade etmiyor. Bekleme durumu her iki kanaldan da bildirilmeli.
 */
export function LinkPendingAnnouncement() {
  const { pending } = useLinkStatus();
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {pending ? 'Sayfa yükleniyor' : ''}
    </span>
  );
}
