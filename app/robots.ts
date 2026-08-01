import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Rezervasyon ekranları kişiye özel seçim taşır ve arama sonucunda
      // görünmesi anlamsız; aktivite sayfaları zaten indekslenir.
      disallow: '/rezervasyon/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
