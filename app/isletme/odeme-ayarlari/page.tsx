import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OperatorNav } from '@/components/OperatorNav';
import { Icon } from '@/components/Icon';
import { currentOperator } from '@/lib/auth';
import { getOperator, getPaymentProfile } from '@/lib/db/operators';
import { isPaymentEnabled, splitAmount } from '@/lib/payments';
import { PaymentProfileForm, CreateSubmerchantForm } from './PaymentForms';
import { formatPrice } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Ödeme ayarları',
  robots: { index: false, follow: false },
};

export default async function PaymentSettingsPage() {
  const session = await currentOperator();
  if (!session) redirect('/isletme');
  // Rol kontrolü sunucuda: menüyü gizlemek yetkilendirme değildir.
  if (session.user.role !== 'owner') redirect('/isletme/tara');

  const operator = (await getOperator(session.operator.id))!;
  const profile = (await getPaymentProfile(session.operator.id))!;
  const providerReady = isPaymentEnabled();
  const connected = Boolean(operator.submerchantKey);

  // Örnek hesap: komisyonun ne demek olduğunu oranla değil, parayla anlatmak
  // daha dürüst.
  const example = splitAmount(1000, operator.commissionBp);

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />

      <main className="mx-auto max-w-[48rem] px-container-margin py-lg">
        <h1 className="mb-xs text-headline-md text-on-background">Ödeme ayarları</h1>
        <p className="mb-lg text-body-md text-on-surface-variant">
          Misafir ödemeyi RASTLA üzerinden yapar; tutarın tamamı tahsil edilir, komisyon kesilir ve
          kalan IBAN&apos;ınıza aktarılır. Kart bilgisi ne RASTLA&apos;nın ne de sizin sunucunuza
          değer — ödeme sağlayıcının kendi sayfasında alınır.
        </p>

        <div
          className={`mb-lg flex items-start gap-3 rounded-xl border p-md ${
            connected
              ? 'border-outline-variant bg-secondary-container text-on-secondary-container'
              : 'border-outline-variant bg-surface-container text-on-surface-variant'
          }`}
        >
          <Icon name={connected ? 'check_circle' : 'close'} size={20} filled />
          <div>
            <p className="text-body-lg font-semibold">
              {connected ? 'Online ödemeye açık' : 'Online ödeme kapalı'}
            </p>
            <p className="text-body-md">
              {connected
                ? 'Aktiviteleriniz rezervasyon sırasında ödeme alıyor.'
                : 'Bilgilerinizi kaydedip sağlayıcıya gönderene kadar ücret deneyim yerinde alınır.'}
            </p>
          </div>
        </div>

        {!providerReady && (
          <p className="mb-lg rounded-xl border border-outline-variant bg-surface-container p-md text-body-md text-on-surface-variant">
            Ödeme sağlayıcısı henüz yapılandırılmamış. Bu adımı şimdi tamamlayabilirsiniz; RASTLA
            sağlayıcı hesabını açtığında işletmeniz kendiliğinden ödemeye açılır.
          </p>
        )}

        <section className="mb-lg">
          <h2 className="mb-sm text-headline-sm text-on-surface">Komisyon</h2>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
            <p className="text-body-md text-on-surface-variant">
              RASTLA payı: <strong className="text-on-surface">%{operator.commissionBp / 100}</strong>
            </p>
            <p className="mt-1 text-body-md text-on-surface-variant">
              {formatPrice(1000)} tutarında bir rezervasyonda{' '}
              <strong className="text-on-surface">{formatPrice(example.submerchantTRY)}</strong>{' '}
              size aktarılır, {formatPrice(example.commissionTRY)} komisyon olarak kesilir.
            </p>
          </div>
        </section>

        <section className="mb-lg">
          <h2 className="mb-sm text-headline-sm text-on-surface">Ticari bilgiler</h2>
          <p className="mb-sm text-body-md text-on-surface-variant">
            Bu bilgiler yalnızca ödeme sağlayıcısına iletilmek ve hakedişinizi aktarmak için
            işlenir. İşletme veri sözleşmesinde bu kalemler ayrıca sayılmıştır.
          </p>
          <PaymentProfileForm profile={profile} />
        </section>

        {!connected && (
          <section>
            <h2 className="mb-sm text-headline-sm text-on-surface">Alt üye işyeri başvurusu</h2>
            <CreateSubmerchantForm ready={providerReady && Boolean(profile.iban)} />
          </section>
        )}
      </main>
    </div>
  );
}
