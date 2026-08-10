import { PanelSkeleton } from '@/components/Skeleton';

/**
 * Rezervasyon ekranının bekleme hâli.
 *
 * Burası müşterinin para harcadığı ekran ve takvim + slotlar + fiyat kuralları
 * için veritabanına gidiyor. Boş bir beyaz sayfa, ödeme yapmak üzere olan
 * birine "site bozuldu" diye okunur.
 */
export default function Loading() {
  return <PanelSkeleton tiles={0} rows={4} />;
}
