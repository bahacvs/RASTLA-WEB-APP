import { PanelSkeleton } from '@/components/Skeleton';

/**
 * İşletme panelinin bekleme ekranı.
 *
 * App Router bunu, bölümdeki herhangi bir sayfaya gidilirken **anında**
 * gösteriyor — sunucu cevabını beklemeden. Bu dosya yokken tıklamayla sayfanın
 * gelmesi arasında ekranda hiçbir şey değişmiyordu ve panelin çoğu ekranı
 * `force-dynamic` olduğu için o boşluk saniyelerce sürebiliyordu.
 */
export default function Loading() {
  return <PanelSkeleton />;
}
