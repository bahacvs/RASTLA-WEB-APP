import { redirect } from 'next/navigation';
import { getActiveLink } from '@/lib/db/booking-links';
import { getActivityById } from '@/lib/db/activities';

/**
 * Paylaşılabilir rezervasyon linki: `/r/<KOD>`
 *
 * Kısa olması işlevsel bir gereklilik, süs değil: bu adres tabelaya basılıyor,
 * Instagram bio'suna sığması gerekiyor ve müşteri onu telefonda okuyor.
 *
 * Kod, hedef ilana yönlendirmenin yanında **rezervasyona kaynak etiketi**
 * takıyor (`?k=`). Etiket sonra sunucuda yeniden çözülüyor — adres çubuğundaki
 * değere güvenilmiyor (bkz. lib/db/booking-links.ts, `resolveLink`).
 *
 * Bilinmeyen ya da kapatılmış kod ana sayfaya düşüyor, 404'e değil: elinde eski
 * bir el ilanı olan müşteriye "böyle bir sayfa yok" demek yerine, onu
 * aramaya devam edebileceği bir yere bırakmak daha iyi.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kod: string }> }
) {
  const { kod } = await params;

  const link = await getActiveLink(kod);
  if (!link) redirect('/');

  const activity = await getActivityById(link.activityId);
  // Yayından kaldırılmış bir ilanın linki de ana sayfaya düşüyor: rezervasyon
  // sayfasına yönlendirip orada "bulunamadı" göstermek, müşteriyi iki adımda
  // aynı sonuca götürmek olurdu.
  if (!activity || activity.status !== 'published') redirect('/');

  redirect(`/rezervasyon/${activity.slug}?k=${link.code}`);
}
