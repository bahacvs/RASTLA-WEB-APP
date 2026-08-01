'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Beklenmedik istemci hatalarında tam sayfa çökme yerine kurtarma ekranı.
 * Üretimde hata mesajı kullanıcıya gösterilmez; yalnızca konsola düşer.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-container-margin text-center">
      <h1 className="mb-sm text-headline-md text-on-background">Bir şeyler ters gitti</h1>
      <p className="mb-lg max-w-[28rem] text-body-lg text-on-surface-variant">
        Sayfa yüklenirken beklenmedik bir hata oluştu. Tekrar denemek sorunu çözebilir.
      </p>

      {error.digest && (
        <p className="mb-lg text-label-sm text-outline">Hata kodu: {error.digest}</p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-sm">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-primary px-6 py-3 text-label-bold text-on-primary transition-transform active:scale-95"
        >
          Tekrar Dene
        </button>
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
