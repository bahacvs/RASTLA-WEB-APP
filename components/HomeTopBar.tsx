import Image from 'next/image';
import { Icon } from './Icon';

/**
 * Ana sayfanın üst çubuğu: konum bilgisi ve marka sembolü.
 *
 * `sticky`, `fixed` DEĞİL — ve dış/iç olmak üzere iki katman. İkisinin de
 * sebebi aynı hatanın iki yüzü:
 *
 *   1. `fixed` bir öğede `mx-auto` hiçbir şey yapmıyor: öğe akıştan çıktığı
 *      için ortalanmıyor, sol kenara yapışıp `max-w-7xl` kadar yer kaplıyor.
 *      1280 pikselden geniş ekranlarda sağda örtülmemiş bir şerit kalıyordu.
 *   2. `fixed top-0`, akışın en üstündeki tanıtım bandının ÜZERİNE biniyordu.
 *      Bant "bu ilanlar uydurmadır" demek için var; görünmediği sürece hiçbir
 *      işe yaramıyor. Görünen tek yeri, başlığın yetişemediği o şeritti.
 *
 * `sticky` akışta kaldığı için bandın altına diziliyor ve genişliği kabından
 * geliyor. Genişlik sınırı İÇ katmanda: çubuk baştan başa uzanıyor, içeriği
 * sayfayla aynı hizada duruyor.
 */
export function HomeTopBar() {
  return (
    <header className="sticky top-0 z-50 w-full bg-surface shadow-sm">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-container-margin">
        <div className="flex items-center gap-2">
          <Icon name="location_on" filled className="text-primary" />
          <div className="flex flex-col">
            <span className="text-label-sm text-on-surface-variant">Konum</span>
            <span className="text-body-md font-semibold">
              Büyükçekmece, İstanbul
            </span>
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
      </div>
    </header>
  );
}
