import type { Metadata } from 'next';
import { SearchView } from './SearchView';
import { isActivityCategory } from '@/lib/data';

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

  return (
    <SearchView initialQuery={q ?? ''} initialCategory={category} />
  );
}
