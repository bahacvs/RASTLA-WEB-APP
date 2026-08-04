import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';

/**
 * Mobil öncelikli bir ürün olduğu için "ana ekrana ekle" desteklenir.
 * Turist kullanıcı sahilde uygulamayı tekrar açabilsin diye önemli.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Su sporları ve yerel aktiviteler`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#fbf9f6',
    theme_color: '#0754b8',
    lang: 'tr',
    // Kurulabilirlik için 192 ve 512 zorunlu; `maskable` Android'in ikonu
    // kendi şekline kırpmasına izin verir, yoksa kenarları kesilir.
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/brand/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
