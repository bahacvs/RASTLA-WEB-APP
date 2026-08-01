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
    icons: [
      {
        src: '/brand/rastla-app-icon.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  };
}
