import Link from 'next/link';
import Image from 'next/image';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-container-margin text-center">
      <Image
        src="/brand/rastla-symbol.png"
        alt=""
        width={64}
        height={64}
        className="mb-lg h-16 w-16 object-contain opacity-80"
      />

      <h1 className="mb-sm text-headline-md text-on-background">Bu sayfayı bulamadık</h1>
      <p className="mb-lg max-w-[28rem] text-body-lg text-on-surface-variant">
        Aradığın deneyim kaldırılmış ya da adres yanlış olabilir. Yakınındaki diğer aktivitelere
        göz atabilirsin.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-sm">
        <Link
          href="/ara"
          className="rounded-lg bg-primary px-6 py-3 text-label-bold text-on-primary transition-transform active:scale-95"
        >
          Deneyimleri Keşfet
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-outline-variant px-6 py-3 text-label-bold text-on-surface-variant transition-transform active:scale-95"
        >
          Ana Sayfa
        </Link>
      </div>
    </main>
  );
}
