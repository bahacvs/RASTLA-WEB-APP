import type { Metadata } from 'next';
import { SearchView } from './SearchView';
import { isActivityCategory } from '@/lib/catalog';
import { listPublishedActivities } from '@/lib/db/activities';

export const metadata: Metadata = {
  title: 'Arama',
  description:
    'Büyükçekmece çevresindeki su sporu ve aktivite seçeneklerini listede ya da harita üzerinde keşfet.',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kategori?: string }>;
}) {
  const { q, kategori } = await searchParams;
  const category = isActivityCategory(kategori) ? kategori : undefined;

  // Katalogun tamamı istemciye verilir: arama kutusuna her harfte sunucuya
  // gitmek yerine filtreleme anında yapılır. Pilot ölçeğinde uygun; katalog
  // büyürse sunucu tarafı aramaya geçilmeli.
  const activities = listPublishedActivities();

  return (
    <SearchView activities={activities} initialQuery={q ?? ''} initialCategory={category} />
  );
}
