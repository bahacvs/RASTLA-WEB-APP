import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Tüm görseller repo içinde (public/) barındığı için uzak kaynak tanımlanmıyor.
  // Uygulama bilinçli olarak hiçbir dış host'a istek atmaz.
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
