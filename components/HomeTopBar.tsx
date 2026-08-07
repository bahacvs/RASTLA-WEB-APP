import Image from 'next/image';
import { Icon } from './Icon';

/** Ana sayfanın üst çubuğu: konum bilgisi, marka sembolü ve bildirimler. */
export function HomeTopBar() {
  return (
    <header className="fixed top-0 z-50 mx-auto flex h-16 w-full max-w-7xl items-center justify-between bg-surface px-container-margin shadow-sm">
      <div className="flex items-center gap-2">
        <Icon name="location_on" filled className="text-primary" />
        <div className="flex flex-col">
          <span className="text-label-sm text-on-surface-variant">Konum</span>
          <span className="text-body-md font-semibold">Büyükçekmece, İstanbul</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Image
          src="/brand/rastla-symbol.png"
          alt="RASTLA"
          width={32}
          height={32}
          className="h-8 w-8 object-contain"
          priority
        />
        {/*
          Bildirim düğmesi kaldırıldı. Arkasında bildirim sistemi yok ve
          olmayan bir özelliğe zil simgesi koymak, kullanıcıya okunmamış bir
          şey olabileceğini düşündürüp her seferinde boşa tıklatıyordu.
        */}
      </div>
    </header>
  );
}
