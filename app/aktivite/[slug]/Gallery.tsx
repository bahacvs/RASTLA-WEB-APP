'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';

/**
 * Yatay kaydırmalı hero galerisi. Aktif görsel, kaydırma konumundan
 * hesaplanır ve alttaki noktalar buna göre güncellenir.
 */
export function Gallery({ images }: { images: { src: string; alt: string }[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div className="group relative h-[400px] w-full overflow-hidden md:h-[500px] md:rounded-xl lg:h-[600px]">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="scrollbar-hide flex h-full w-full snap-x snap-mandatory overflow-x-auto"
      >
        {images.map((image, i) => (
          <div key={image.src} className="relative h-full w-full flex-shrink-0 snap-center">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(min-width: 768px) 66vw, 100vw"
              className="object-cover"
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 transform gap-2">
          {images.map((image, i) => (
            <div
              key={image.src}
              className={`h-2 w-2 rounded-full shadow-sm transition-all duration-300 ${
                i === active ? 'bg-on-primary' : 'bg-on-primary/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
