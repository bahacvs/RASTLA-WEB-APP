import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { IS_DEMO } from '@/lib/demo';

export default function robots(): MetadataRoute.Robots {
  // Demo kipinde tarayıcılara hiçbir şey açılmaz: uydurma işletme ve ilanlar
  // arama sonuçlarında gerçek hizmetmiş gibi görünmemeli.
  if (IS_DEMO) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

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
