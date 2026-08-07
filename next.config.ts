import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
