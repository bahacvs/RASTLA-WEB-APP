'use client';

import { useEffect, useRef } from 'react';

/**
 * Sahte ödeme formu — iyzico'nun barındırdığı formun yerini tutar.
 *
 * Gerçek akışta kullanıcı kart bilgisini sağlayıcının sayfasına girer ve
 * sağlayıcı işi bitince geri çağrı adresine bir POST atar. Burada kart alanı
 * yok ama **POST'un kendisi gerçek**: geri çağrı ucunun asıl kullanılan yolu
 * budur ve testin onu geçmesi gerekir.
 */
export function AutoSubmit({ token }: { token: string }) {
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    form.current?.submit();
  }, []);

  return (
    <form ref={form} method="POST" action="/odeme/donus">
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        className="h-12 w-full rounded-lg bg-primary text-label-bold text-on-primary"
      >
        Ödemeyi tamamla
      </button>
    </form>
  );
}
