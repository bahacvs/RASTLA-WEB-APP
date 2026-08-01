import type { MetadataRoute } from 'next';
import { ACTIVITIES } from '@/lib/data';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/ara`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    // Aktivite sayfaları organik aramanın asıl giriş noktası.
    ...ACTIVITIES.map((activity) => ({
      url: `${SITE_URL}/aktivite/${activity.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
  ];
}
