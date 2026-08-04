'use client';

import { useEffect } from 'react';

/**
 * Service worker kaydı.
 *
 * Yalnızca üretimde kaydedilir: geliştirme sırasında önbellek, yapılan
 * değişikliklerin görünmesini engelleyip yanıltıcı hata avlarına yol açar.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // Sayfa yükü bittikten sonra kaydet; ilk açılışı yavaşlatmasın.
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Kayıt başarısız olursa uygulama normal çalışmaya devam eder;
        // yalnızca çevrimdışı desteği olmaz.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
