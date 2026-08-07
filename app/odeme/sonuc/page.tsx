import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = {
  title: 'Ödeme sonucu',
  robots: { index: false, follow: false },
};

/**
 * Ödeme tamamlanamadığında gelinen sayfa.
 *
 * Sebep bilinçli olarak ayrıntısız: "tutar uyuşmadı" ya da "eşleştirme kimliği
 * tutmadı" demek, kurcalayan birine hangi kontrolün yakaladığını öğretirdi.
 * Ayrıntı işlem günlüğünde; kullanıcının ihtiyacı olan tek bilgi, parasının
 * çekilmediği ve ne yapacağı.
 */
const MESSAGES = {
  eksik: {
    title: 'Ödeme tamamlanamadı',
    body: 'Ödeme oturumu bulunamadı. Rezervasyonunuz oluşmadıysa tekrar deneyebilirsiniz.',
  },
  basarisiz: {
    title: 'Ödeme alınamadı',
    body: 'Kartınızdan tahsilat yapılamadı. Tutulan yeriniz kısa süre içinde serbest bırakılır; dilerseniz hemen yeniden deneyebilirsiniz.',
  },
} as const;

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string }>;
}) {
  const { durum } = await searchParams;
  const message = durum === 'eksik' ? MESSAGES.eksik : MESSAGES.basarisiz;

  return (
    <div className="flex min-h-screen items-center justify-center px-container-margin py-lg">
      <div className="w-full max-w-[28rem] rounded-xl border border-outline-variant bg-surface-container-lowest p-lg text-center shadow-card">
        <Icon name="close" size={40} className="mb-sm text-outline" />
        <h1 className="mb-sm text-headline-sm text-on-surface">{message.title}</h1>
        <p className="mb-lg text-body-md text-on-surface-variant">{message.body}</p>

        <div className="flex flex-col gap-sm">
          <Link
            href="/ara"
            className="rounded-lg bg-primary px-4 py-3 text-label-bold text-on-primary transition-transform active:scale-95"
          >
            Deneyimlere dön
          </Link>
          <Link
            href="/rezervasyonlarim"
            className="rounded-lg border border-outline-variant px-4 py-3 text-label-bold text-on-surface-variant"
          >
            Rezervasyonlarım
          </Link>
        </div>
      </div>
    </div>
  );
}
