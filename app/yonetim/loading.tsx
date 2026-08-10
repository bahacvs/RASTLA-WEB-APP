import { PanelSkeleton } from '@/components/Skeleton';

/** RASTLA operasyon panelinin bekleme ekranı. */
export default function Loading() {
  return <PanelSkeleton tiles={3} rows={5} />;
}
