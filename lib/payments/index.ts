import { fakeProvider } from './fake';
import { isIyzicoConfigured, iyzicoProvider } from './iyzico';
import type { PaymentProvider } from './types';

export * from './types';

/**
 * Ödeme sağlayıcısı seçimi.
 *
 *   PAYMENT_PROVIDER=fake            -> test sağlayıcısı
 *   IYZICO_API_KEY tanımlı           -> iyzico
 *   hiçbiri                          -> ödeme KAPALI
 *
 * "Ödeme kapalı" gerçek bir durum, hata değil: şirket kurulup üye işyeri
 * açılana kadar sistem çalışmaya devam etmeli. O sürede rezervasyonlar
 * ödemesiz oluşur ve ücret deneyim yerinde alınır — yani bu fazdan önceki
 * davranış korunur.
 */

let cached: PaymentProvider | null = null;

export function paymentProvider(): PaymentProvider | null {
  if (cached) return cached;

  if (process.env.PAYMENT_PROVIDER === 'fake') {
    cached = fakeProvider();
    return cached;
  }

  if (isIyzicoConfigured()) {
    cached = iyzicoProvider();
    return cached;
  }

  return null;
}

export function resetPaymentProvider(): void {
  cached = null;
}

/** Online ödeme devrede mi. */
export function isPaymentEnabled(): boolean {
  return paymentProvider() !== null;
}

/**
 * Ödeme süresi: bu kadar sonra `pending_payment` rezervasyon düşürülür ve
 * kapasite geri verilir.
 *
 * 20 dakika, 3D Secure adımını ve kartını aramaya giden kullanıcıyı rahatça
 * kapsar; öte yandan bir slotu yarım saatten uzun kilitli tutmaz.
 */
export const PAYMENT_TIMEOUT_MINUTES = Number(process.env.PAYMENT_TIMEOUT_MINUTES ?? 20);

/**
 * Komisyonu hesaplar ve işletmeye kalanı döner.
 *
 * Tam sayı aritmetiği: kuruş hesabında kayan nokta yuvarlaması, zamanla
 * mutabakatı bozan türden sessiz hatalara yol açar.
 */
export function splitAmount(
  amountTRY: number,
  commissionBp: number
): { commissionTRY: number; submerchantTRY: number } {
  const commissionTRY = Math.floor((amountTRY * commissionBp) / 10000);
  return { commissionTRY, submerchantTRY: amountTRY - commissionTRY };
}
