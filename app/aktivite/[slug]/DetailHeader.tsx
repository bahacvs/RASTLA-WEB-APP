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
  const [copied, setCopied] = useState(false);

  /**
   * Telefonda işletim sisteminin paylaşım sayfasını açar; masaüstünde ya da
   * desteklenmeyen tarayıcıda adresi panoya kopyalar ve düğme kısa süre onay
   * simgesine döner.
   *
   * `navigator.share` kullanıcı iptal ettiğinde de hata fırlatır — bu bir
   * arıza değil, karar. O yüzden sessizce yutuluyor; panoya kopyalama da
   * başarısız olursa yapacak bir şey kalmıyor.
   */
  async function share() {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch {
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Pano da yoksa yapılacak bir şey yok.
    }
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    /*
      `sticky` + `-mb-16`: başlık AKIŞTA ama yer KAPLAMIYOR.

      Buradaki tasarım kasıtlı — başlık açılışta kahraman görselin üzerinde
      şeffaf duruyor, kaydırınca opaklaşıyor. `fixed` ile yapılıyordu ve iki
      şeyi bozuyordu: `mx-auto` akış dışı bir öğede ortalamadığı için başlık
      sola yapışıp geniş ekranlarda sağda örtülmemiş bir şerit bırakıyordu, ve
      sayfanın en üstündeki tanıtım bandını tamamen kapatıyordu.

      `sticky` bandın altına diziliyor; negatif alt boşluk kapladığı 64 pikseli
      geri veriyor, böylece görsel yine başlığın altından başlıyor ve şeffaf
      geçiş korunuyor.
    */
    <header
      className={`sticky top-0 z-50 -mb-16 w-full transition-all duration-300 ${
        scrolled ? 'border-b border-outline-variant/30 bg-surface shadow-sm' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-container-margin">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Geri"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-on-surface shadow-sm backdrop-blur-md transition-transform active:scale-95"
      >
        <Icon name="arrow_back" filled />
      </button>

      {/*
        Favori düğmesi kaldırıldı: arkasında hiçbir şey yoktu ve favori
        saklamak hesap ile kalıcılık gerektiriyor — yani bu fazda olmayan bir
        özellik. Duran ama çalışmayan bir düğme, olmayan özellikten kötü.
        Paylaş ise gerçekten uygulandı; pazaryeri için karşılığı olan tek
        düğme oydu.
      */}
      <button
        type="button"
        onClick={share}
        aria-label="Paylaş"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-on-surface shadow-sm backdrop-blur-md transition-transform active:scale-95"
      >
        <Icon name={copied ? 'check_circle' : 'share'} />
      </button>
      </div>
    </header>
  );
}
