import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { paymentProvider } from '@/lib/payments';
import { AutoSubmit } from './AutoSubmit';

export const metadata: Metadata = {
  title: 'Test ödemesi',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Sahte ödeme sayfası — YALNIZCA test sağlayıcısı devredeyken var.
 *
 * `PAYMENT_PROVIDER=fake` değilse 404 döner. Koşul burada, sayfanın kendi
 * içinde: yönlendirmeyi engellemek ya da bağlantıyı gizlemek yetmezdi, çünkü
 * adresi bilen biri doğrudan gelebilir. Üretimde bu sayfa yoktur ve olmaması
 * gerekir — var olsaydı ödeme almadan bilet üretmenin bir yolu olurdu.
 */
export default async function TestPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (paymentProvider()?.name !== 'fake') notFound();

  const { token } = await searchParams;
  if (!token) notFound();

  return (
    <div className="flex min-h-screen items-center justify-center px-container-margin py-lg">
      <div className="w-full max-w-[24rem] rounded-xl border border-outline-variant bg-surface-container-lowest p-lg text-center shadow-card">
        <h1 className="mb-sm text-headline-sm text-on-surface">Test ödeme sayfası</h1>
        <p className="mb-lg text-body-md text-on-surface-variant">
          Gerçek kurulumda burası ödeme kuruluşunun kendi sayfasıdır ve kart bilgileri orada
          alınır. Bu sayfa yalnızca test sağlayıcısı devredeyken görünür.
        </p>
        <AutoSubmit token={token} />
      </div>
    </div>
  );
}
