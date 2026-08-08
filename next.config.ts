import type { NextConfig } from 'next';
import { TILE_HOST } from './lib/map';

/**
 * Güvenlik başlıkları.
 *
 * Bunlar yoktu ve eksiklikleri bilinçli bir tercih değildi. En somut sonucu:
 * bilet onay ve rezervasyon ekranları bir iframe'e gömülebiliyordu.
 *
 * Her satırın neden öyle olduğu yazılı, çünkü bir CSP'yi sonradan okuyan kişi
 * genellikle onu gevşetmek üzere okur ve neyin niye orada olduğunu bilmeden
 * gevşetmek, başlığı hiç koymamaktan farksızdır.
 */
function securityHeaders() {
  const csp = [
    // Aşağıda ayrıca izin verilmeyen her şey kapalı.
    `default-src 'self'`,

    // 'unsafe-inline' istenerek değil, mecburen: Next.js sayfayı canlandırmak
    // için satır içi betik yerleştiriyor ve nonce'a geçmek statik ön üretimle
    // birlikte ayrı bir iş. Yine de kazanç gerçek — saldırganın kendi alan
    // adından betik yükletmesi bu satırla kapanıyor, XSS'in en yaygın yolu o.
    `script-src 'self' 'unsafe-inline'`,

    // Tailwind sınıf üretiyor ama çerçeve satır içi stil de yerleştiriyor.
    `style-src 'self' 'unsafe-inline'`,

    // Görsellerin tamamı kendi alan adımızdan. data:/blob: çerçevenin kendi
    // yer tutucuları ve harita karolarının canvas'a aktarımı için.
    `img-src 'self' data: blob:`,

    // Uygulamanın TEK dış bağlantısı: harita karoları. Listeyi lib/map.ts'den
    // alıyor ki host iki yerde ayrı ayrı yazılmasın ve biri unutulmasın.
    `connect-src 'self' https://${TILE_HOST}`,

    // MapLibre worker'ı kendi alan adımızdan yükleniyor (public/maplibre/).
    // blob: ihtiyaten duruyor: kütüphane bazı yollarda blob worker kuruyor.
    `worker-src 'self' blob:`,

    // Yazı tipleri repoda.
    `font-src 'self'`,

    // Çerçevelemeye karşı asıl koruma bu. X-Frame-Options aynı şeyi eski
    // tarayıcılar için tekrarlıyor.
    `frame-ancestors 'none'`,

    // Form gönderimi yalnızca bize. Ödeme akışı bunu bozmuyor: iyzico'ya
    // geçiş sunucu tarafı yönlendirmeyle (redirect) yapılıyor, form
    // gönderimiyle değil — kontrol edildi (app/actions/booking.ts).
    `form-action 'self'`,

    // <base> ile göreli adreslerin kaçırılmasını engeller.
    `base-uri 'self'`,

    // Hiçbir yerde iframe kullanılmıyor.
    `frame-src 'none'`,
    `object-src 'none'`,
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Dış adrese yalnızca kaynak (origin) gider, tam yol gitmez. Bilet ve
    // rezervasyon adresleri kod içeriyor; bunların dışarı sızmaması gerekiyor.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Kamera AÇIK: /isletme/tara bilet okuturken kullanıyor.
    // Konum AÇIK: /ara "Yakınımdakiler" ile sonuçları mesafeye göre sıralıyor.
    //   Koordinat tarayıcıda kalıyor, sunucuya gönderilmiyor (bkz. lib/geo.ts) —
    //   ama izin başlıkta kapalıysa tarayıcı API'yi hiç çağırtmaz, o yüzden
    //   burada açık olmak zorunda.
    // Geri kalanına ihtiyaç yok.
    {
      key: 'Permissions-Policy',
      value:
        'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), interest-cohort=()',
    },
  ];
}

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }];
  },

  // Uzak kaynak TANIMLANMIYOR ve tanımlanmamalı. İşletmenin yüklediği görseller
  // de dahil olmak üzere her görsel kendi alan adımızdan gelir: yüklenenler
  // `/gorsel/[id]` üzerinden sunulur (bkz. app/gorsel/[id]/route.ts). Doğrudan
  // blob adresi verilseydi tarayıcı yeni bir dış host'a istek atardı; bu hem
  // verify-offline.mjs'in koruduğu güvenceyi bozar hem de üçüncü bir tarafa
  // her ziyaretçinin IP adresini gösterirdi.
  images: {
    remotePatterns: [],
  },

  experimental: {
    serverActions: {
      // Görsel yükleme sunucu eylemiyle yapılıyor ve varsayılan gövde sınırı
      // 1 MB. Telefon fotoğrafları bunu rahatça aşar. Sınır, lib/images.ts
      // içindeki 6 MB'lik dosya sınırının biraz üzerinde: asıl reddi orası
      // veriyor ve kullanıcıya anlaşılır bir hata gösteriyor. Burada eşit
      // olsaydı sınırdaki dosya, sebebi söylenmeden çerçeve tarafından
      // kesilirdi.
      bodySizeLimit: '8mb',
    },
  },
};

export default nextConfig;
