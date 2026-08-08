'use client';

import { useCallback, useState } from 'react';
import type { Coords } from './geo';

/**
 * Konum izni akışı.
 *
 * İzin **kullanıcı düğmeye bastığında** isteniyor, sayfa açılır açılmaz
 * değil. Sebep pratik: kendiliğinden çıkan konum sorusu çok daha yüksek
 * oranda reddediliyor ve tarayıcı bu reddi kalıcı sayıyor — yani bir kez
 * otomatik sorup reddedilmek, özelliği o kullanıcı için tamamen kapatıyor.
 * Ne istendiğini bilerek basılan düğme hem daha çok kabul alıyor hem de
 * reddedildiğinde geri dönülebilir kalıyor.
 *
 * Koordinat yalnızca bellekte tutuluyor: sunucuya gönderilmiyor, çereze ya da
 * yerel depoya yazılmıyor. Sekme kapandığında iz kalmıyor. Gerekçesi
 * lib/geo.ts başında.
 */
export type NearbyState =
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'ready'; coords: Coords }
  | { status: 'denied' }
  | { status: 'unavailable' };

export function useNearby() {
  const [state, setState] = useState<NearbyState>({ status: 'idle' });

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ status: 'unavailable' });
      return;
    }

    setState({ status: 'asking' });

    navigator.geolocation.getCurrentPosition(
      (position) =>
        setState({
          status: 'ready',
          coords: { lat: position.coords.latitude, lng: position.coords.longitude },
        }),
      (error) =>
        // PERMISSION_DENIED (1) ile "konum alınamadı" ayrı şeyler: ilki
        // kullanıcının kararı, ikincisi cihazın sorunu. Kullanıcıya
        // reddetmediği bir şey için "izin vermediniz" demek yanlış olurdu.
        setState({ status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  const clear = useCallback(() => setState({ status: 'idle' }), []);

  return { state, request, clear };
}
