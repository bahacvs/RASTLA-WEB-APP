import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentOperator } from '@/lib/auth';
import { CARD } from '@/components/form';
import { SignupForm } from './SignupForm';

export const metadata: Metadata = {
  title: 'İşletme Kaydı',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * İşletmenin kendi başvurusu.
 *
 * Sayfa iki şeyi baştan söylüyor: hesabın **hemen** açıldığını ve ilanların
 * **incelemeden geçeceğini**. İkincisini gizlemek, ilanını girip yayına
 * alamayan işletmenin bunu ancak "Yayına Al" düğmesinde öğrenmesi demekti.
 */
export default async function SignupPage() {
  // Zaten girişliyse form gösterilmiyor: ikinci bir işletme açmak isteyen
  // kişinin yolu ayrı (çoklu işletme erişimi), ve bu form onu yanlış yere
  // götürürdü.
  if (await currentOperator()) redirect('/isletme/bugun');

  return (
    <div className="mx-auto flex min-h-screen max-w-[32rem] flex-col justify-center px-container-margin py-lg">
      <h1 className="mb-xs text-headline-md text-on-background">İşletme kaydı</h1>
      <p className="mb-lg text-body-md text-on-surface-variant">
        Hesabınız hemen açılır ve takviminizi kurmaya başlayabilirsiniz.
      </p>

      <div className={`${CARD} mb-lg`}>
        <SignupForm />
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container p-md text-body-md text-on-surface-variant">
        <p className="mb-sm">
          <strong className="text-on-surface">Sonra ne oluyor?</strong> İlanlarınızı
          hazırlayabilirsiniz ama <strong>ilk ilanınız yayına çıkmadan RASTLA incelemesinden
          geçer.</strong> Müşteriye gösterdiğimiz &quot;doğrulanmış işletme&quot; rozeti bir şey
          vaat ediyor; arkasında bir kontrol olmadan verilemez.
        </p>
        <p>
          Online ödeme almak için ayrıca vergi levhası, IBAN ve yetkili kimliği gerekiyor —
          ödeme altyapısı bunları zorunlu tutuyor. Bunlar olmadan da takvim ve rezervasyon
          çalışır; ücreti tesiste tahsil edersiniz.
        </p>
      </div>

      <p className="mt-lg text-center text-body-md text-on-surface-variant">
        Hesabınız var mı?{' '}
        <Link href="/isletme" className="text-primary underline">
          Giriş yapın
        </Link>
      </p>
    </div>
  );
}
