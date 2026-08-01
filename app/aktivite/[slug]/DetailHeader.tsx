'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';

/**
 * Detay sayfasının üst çubuğu. Galeri üzerinde şeffaf başlar, sayfa 50px'den
 * fazla kaydırıldığında opak yüzeye geçer — prototipteki scroll dinleyicisinin
 * React karşılığı.
 */
export function DetailHeader() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 z-50 mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-container-margin transition-all duration-300 ${
        scrolled ? 'border-b border-outline-variant/30 bg-surface shadow-sm' : 'bg-transparent'
      }`}
    >
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Geri"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-on-surface shadow-sm backdrop-blur-md transition-transform active:scale-95"
      >
        <Icon name="arrow_back" filled />
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Paylaş"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-on-surface shadow-sm backdrop-blur-md transition-transform active:scale-95"
        >
          <Icon name="share" />
        </button>
        <button
          type="button"
          aria-label="Favorilere ekle"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-on-surface shadow-sm backdrop-blur-md transition-transform active:scale-95"
        >
          <Icon name="favorite" />
        </button>
      </div>
    </header>
  );
}
