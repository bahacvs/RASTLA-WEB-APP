import { PanelSkeleton } from '@/components/Skeleton';

/** Acente portalının bekleme ekranı; gerekçesi işletme panelininkiyle aynı. */
export default function Loading() {
  return <PanelSkeleton tiles={0} rows={5} />;
}
