/**
 * Ödeme sağlayıcısı arayüzü.
 *
 * Pazaryeri modeli: RASTLA tutarın tamamını tahsil eder, komisyonunu keser,
 * kalanı işletmeye aktarır. İşletmenin sağlayıcıda "alt üye işyeri" olarak
 * tanımlı olması gerekir.
 *
 * Arayüzün şekli iki şeyi zorluyor:
 *
 *   1. **Sonuç sağlayıcıdan sorulur, geri çağrıdan okunmaz.** `resolve()` bir
 *      token alır ve gerçek sonucu sağlayıcıdan çeker. Geri çağrı gövdesine
 *      güvenilseydi, adresi bilen biri "ödendi" diyen bir istek yollayarak
 *      bedava bilet alabilirdi.
 *   2. **Tutar sağlayıcının söylediğidir.** Çağıran taraf beklediği tutarla
 *      karşılaştırır; uyuşmazsa ödeme reddedilir.
 */

export type CheckoutRequest = {
  /** Bizim ürettiğimiz eşleştirme kimliği; cevabın hangi kayda ait olduğunu doğrular. */
  conversationId: string;
  amountTRY: number;
  /** İşletmeye aktarılacak tutar (tutar eksi komisyon). */
  submerchantAmountTRY: number;
  submerchantKey: string;

  buyer: { id: string; name: string; phone: string; ip: string | null };
  item: { id: string; name: string; category: string };

  /** Sağlayıcının kullanıcıyı geri göndereceği adres. */
  callbackUrl: string;
};

export type CheckoutSession =
  | { ok: true; token: string; /** Formu gösteren betiğin adresi. */ formUrl: string }
  | { ok: false; error: string };

export type PaymentResult =
  | {
      ok: true;
      providerRef: string;
      conversationId: string;
      /** Sağlayıcının tahsil ettiğini söylediği tutar. Beklenenle karşılaştırılır. */
      paidTRY: number;
      currency: string;
      cardFamily?: string;
      cardLastFour?: string;

      /**
       * Sepet kaleminin işlem kimliği (iyzico: `itemTransactions[].paymentTransactionId`).
       *
       * Ödemenin kimliği (`providerRef`) DEĞİL. Alt üye işyerine giden payı
       * serbest bırakmak ya da geri çevirmek için sağlayıcının istediği anahtar
       * budur; ödeme kimliğiyle onay çağrısı yapılamaz. Bu yüzden ayrı bir alan.
       */
      itemTransactionRef?: string;
    }
  | { ok: false; error: string; conversationId?: string };

export type RefundResult =
  | { ok: true; providerRef: string }
  | { ok: false; error: string };

/** Alt üye işyeri payının serbest bırakılması ya da geri çevrilmesi. */
export type ApprovalResult = { ok: true } | { ok: false; error: string };

export type SubmerchantInput = {
  operatorId: string;
  name: string;
  legalType: 'personal' | 'private' | 'limited';
  legalName: string;
  address: string;
  iban: string;
  email: string;
  phone: string;
  taxNumber?: string;
  taxOffice?: string;
  identityNumber?: string;
};

export type SubmerchantResult =
  | { ok: true; submerchantKey: string }
  | { ok: false; error: string };

export interface PaymentProvider {
  readonly name: string;
  /** Ödeme formu oturumu başlatır. */
  startCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /** Sonucu SAĞLAYICIDAN sorar. Geri çağrı gövdesine güvenilmez. */
  resolve(token: string): Promise<PaymentResult>;
  refund(input: { providerRef: string; amountTRY: number; ip: string | null }): Promise<RefundResult>;
  createSubmerchant(input: SubmerchantInput): Promise<SubmerchantResult>;

  /**
   * İşletmenin payını serbest bırakır — hizmet verildi.
   *
   * Pazaryeri modelinde ödeme anında para bölünüp gönderilmiyor: alt üye
   * işyerinin payı sağlayıcıda BLOKE tutuluyor ve onay çağrısıyla açılıyor.
   * Bu ayrım ürünün özü: müşteri parayı ödedi diye işletme kazanmış olmuyor,
   * kazanç hizmetin verilmesiyle doğuyor.
   */
  approve(itemTransactionRef: string): Promise<ApprovalResult>;

  /** Payı geri çevirir — müşteri gelmedi ya da iade edildi. */
  disapprove(itemTransactionRef: string): Promise<ApprovalResult>;
}
