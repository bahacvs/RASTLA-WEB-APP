import type { MetadataRoute } from 'next';
import { listPublishedActivities } from '@/lib/db/activities';
import { SITE_URL } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const activities = await listPublishedActivities();

  return [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/ara`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    // Aktivite sayfaları organik aramanın asıl giriş noktası.
    ...activities.map((activity) => ({
      url: `${SITE_URL}/aktivite/${activity.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
  ];
}
