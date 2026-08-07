'use client';

import { useEffect, useRef, useState } from 'react';
// maplibre-gl v6 varsayılan dışa aktarım sunmaz; yalnızca adlandırılmış dışa aktarımlar.
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_DEFAULT, WORKER_URL, isMapEnabled, styleUrl } from '@/lib/map';
import { formatPrice } from '@/lib/format';
import { IS_DEMO } from '@/lib/demo';
import type { Activity } from '@/lib/catalog';

/**
 * MapLibre hatasını tek satırlık okunur bir özete indirger.
 *
 * Sorgu dizesi atılıyor: hata metinleri başarısız olan adresi olduğu gibi
 * taşıyor ve o adres API anahtarını içeriyor. Anahtar zaten istemci
 * paketinde açık (NEXT_PUBLIC_), yani sır değil — ama ekrana basmanın da
 * gereği yok; hangi ucun düştüğünü görmek için yol yeterli.
 */
function describeMapError(detail: unknown): string {
  const status = (detail as { status?: unknown } | null)?.status;
  const url = (detail as { url?: unknown } | null)?.url;
  const message = detail instanceof Error ? detail.message : String(detail ?? 'bilinmeyen hata');

  const parts = [message.split('\n')[0].slice(0, 160)];
  if (typeof status === 'number') parts.push(`HTTP ${status}`);
  if (typeof url === 'string') parts.push(url.split('?')[0].replace(/^https?:\/\//, ''));

  return parts.join(' — ');
}

/**
 * Arama sonuçlarını gerçek harita üzerinde gösterir.
 *
 * Pinler fiyat balonu olarak çizilir (Airbnb'deki gibi). Harita kaydırıldığında
 * "Bu alanda ara" düğmesi belirir ve görünen alana göre sonuçları kısar.
 *
 * Koordinatı olmayan aktiviteler haritada gösterilemez; işletme konumu
 * girmediyse bu normaldir ve kullanıcıya sayı olarak bildirilir.
 */
export function ActivityMap({
  activities,
  onBoundsChange,
  onReset,
  filtered,
}: {
  activities: Activity[];
  onBoundsChange: (bounds: { north: number; south: number; east: number; west: number }) => void;
  onReset: () => void;
  filtered: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [moved, setMoved] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const withCoords = activities.filter((a) => a.lat !== null && a.lng !== null);
  const missing = activities.length - withCoords.length;

  // Haritayı bir kez kur.
  useEffect(() => {
    if (!container.current || map.current || !isMapEnabled) return;

    // Worker adresini haritayı kurmadan ÖNCE ver.
    //
    // Kütüphane bunu kendisi türetmeye çalışıyor ve paketleme sonrası boş
    // dize üretiyor; o hâlde worker sayfanın kendisini yüklemeye çalışıp
    // sessizce ölüyor, karolar hiç istenmiyor. Ayrıntı lib/map.ts'de.
    setWorkerUrl(WORKER_URL);

    const instance = new MapLibreMap({
      container: container.current,
      style: styleUrl(),
      center: [MAP_DEFAULT.lng, MAP_DEFAULT.lat],
      zoom: MAP_DEFAULT.zoom,
      attributionControl: { compact: true },
    });

    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    instance.on('dragend', () => setMoved(true));
    instance.on('zoomend', () => setMoved(true));

    // MapLibre hatalarını yutmayı bırak.
    //
    // Stil ya da karo yüklenemediğinde harita çökmüyor: arka plan katmanını
    // boyuyor, pinleri koyuyor ve susuyor. Ekranda kalan şey "boş ama bozuk
    // değilmiş gibi duran" bir alan oluyor — bakan kişi neyin yanlış
    // olduğunu göremiyor, biz de göremiyoruz.
    instance.on('error', (event) => {
      const detail = event?.error ?? event;
      console.error('[harita]', detail);
      setMapError(describeMapError(detail));
    });

    // Karolar gelmeye başladığı an uyarı düşer; geçici bir ağ hatası
    // ekranda takılı kalmamalı.
    instance.on('data', (event) => {
      if (event.dataType === 'source' && event.isSourceLoaded) setMapError(null);
    });

    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);

  // Sonuçlar değiştikçe pinleri yeniden çiz.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    for (const marker of markers.current) marker.remove();
    markers.current = [];

    for (const activity of withCoords) {
      const el = document.createElement('a');
      el.href = `/aktivite/${activity.slug}`;
      el.className =
        'block rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-label-sm font-semibold text-on-surface shadow-md hover:bg-primary hover:text-on-primary';
      el.textContent = formatPrice(activity.priceTRY);
      el.title = activity.title;

      markers.current.push(
        new Marker({ element: el }).setLngLat([activity.lng!, activity.lat!]).addTo(instance)
      );
    }
  }, [withCoords]);

  function searchThisArea() {
    const instance = map.current;
    if (!instance) return;

    const bounds = instance.getBounds();
    onBoundsChange({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    });
    setMoved(false);
  }

  // Anahtar yokken bu ekrana normalde hiç gelinmez: /ara harita düğmesini
  // çizmiyor. Yine de savunma olarak duruyor — bileşen başka bir yerden
  // çağrılabilir. Metin ziyaretçiye göre yazılı: eskiden burada ortam
  // değişkeninin adı yazıyordu ve bunu okuyan kişi siteyi bozuk sanıyordu.
  // Eksikliğin görülmesi gereken yer arayüz değil, `/api/saglik`.
  if (!isMapEnabled) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-container p-lg text-center">
        <p className="text-body-md text-on-surface-variant">
          Harita görünümü şu an kullanılamıyor. Aktiviteleri liste görünümünden
          inceleyebilirsiniz.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" />

      {mapError && (
        <div className="absolute inset-x-2 top-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 shadow-md">
          <p className="text-body-md text-on-surface">Harita katmanı yüklenemedi.</p>
          {/*
            Teknik ayrıntı yalnızca tanıtım sürümünde. Gerçek ziyaretçiye
            sağlayıcı hatası göstermenin faydası yok; tanıtım sürümünü ise
            telefondan inceleyen kişi konsolu açamıyor, sebebi burada
            görebilmeli.
          */}
          {IS_DEMO && (
            <p className="mt-1 font-mono text-label-sm break-words text-on-surface-variant">
              {mapError}
            </p>
          )}
        </div>
      )}

      {(moved || filtered) && (
        <div className="absolute top-sm left-1/2 flex -translate-x-1/2 gap-2">
          {moved && (
            <button
              type="button"
              onClick={searchThisArea}
              className="rounded-full border border-outline-variant bg-surface-container-lowest px-4 py-2 text-label-bold whitespace-nowrap text-primary shadow-md transition-transform active:scale-95"
            >
              Bu alanda ara
            </button>
          )}
          {filtered && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-full border border-outline-variant bg-surface-container-lowest px-4 py-2 text-label-bold whitespace-nowrap text-on-surface-variant shadow-md transition-transform active:scale-95"
            >
              Alanı temizle
            </button>
          )}
        </div>
      )}

      {missing > 0 && (
        <p className="absolute bottom-2 left-2 rounded bg-surface/90 px-2 py-1 text-label-sm text-on-surface-variant">
          {missing} deneyimin konumu girilmemiş
        </p>
      )}
    </div>
  );
}
