import type { Metadata } from 'next';
import { SearchView } from './SearchView';

export const metadata: Metadata = {
  title: 'Arama',
  description: 'Büyükçekmece çevresindeki su sporu ve aktivite seçeneklerini listede ya da harita üzerinde keşfet.',
};

export default function SearchPage() {
  return <SearchView />;
}
