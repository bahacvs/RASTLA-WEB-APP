import { createHmac, randomBytes } from 'node:crypto';
import type {
  ApprovalResult,
  CheckoutRequest,
  CheckoutSession,
  PaymentProvider,
  PaymentResult,
  RefundResult,
  SubmerchantInput,
  SubmerchantResult,
} from './types';

/**
 * iyzico — Pazaryeri (alt üye işyeri) modeli.
 *
 * **Kart verisi bu sunucuya hiç değmez.** Barındırılan Checkout Form
 * kullanılıyor: kullanıcı kart bilgisini iyzico'nun formuna giriyor, biz
 * yalnızca bir token alıyoruz. Bu, PCI kapsamını en aza indiren tek makul
 * seçim; kart alanlarını kendimiz toplasaydık kapsam bütün sunucuya yayılırdı.
 *
 * Sonuç, geri çağrı gövdesinden DEĞİL, token ile sağlayıcıya sorularak
 * öğrenilir (`resolve`). Aksi hâlde adresi bilen biri "ödendi" diyen bir
 * istek yollayıp bedava bilet alabilirdi.
 *
 * Resmî `iyzipay` npm paketi yerine düz `fetch` kullanılıyor: paket geri
 * çağrı tabanlı ve eski bir bağımlılık ağacı taşıyor; ihtiyacımız olan üç uç
 * için imzalama mantığını burada tutmak hem daha az bağımlılık hem de neyin
 * imzalandığının görülebilmesi demek.
 */

const SANDBOX = 'https://sandbox-api.iyzipay.com';
const PRODUCTION = 'https://api.iyzipay.com';

function config() {
  return {
    apiKey: process.env.IYZICO_API_KEY ?? '',
    secretKey: process.env.IYZICO_SECRET_KEY ?? '',
    baseUrl: process.env.IYZICO_BASE_URL ?? (process.env.IYZICO_SANDBOX === '0' ? PRODUCTION : SANDBOX),
  };
}

export function isIyzicoConfigured(): boolean {
  const { apiKey, secretKey } = config();
  return apiKey.length > 0 && secretKey.length > 0;
}

/**
 * iyzico'nun HmacSHA256 yetkilendirme başlığı.
 *
 * İmzalanan dizgi: randomKey + uriPath + gövde. Gövde birebir gönderilenle
 * aynı olmak zorunda — JSON'u iki kez üretmek (biri imza, biri istek için)
 * alan sırası farklı çıkarsa imzayı bozar; bu yüzden tek kez üretilip
 * ikisinde de o dizgi kullanılıyor.
 */
function authorization(uriPath: string, body: string, randomKey: string): string {
  const { apiKey, secretKey } = config();

  const signature = createHmac('sha256', secretKey)
    .update(randomKey + uriPath + body)
    .digest('hex');

  const authorizationParams = [
    `apiKey:${apiKey}`,
    `randomKey:${randomKey}`,
    `signature:${signature}`,
  ].join('&');

  return `IYZWSv2 ${Buffer.from(authorizationParams).toString('base64')}`;
}

async function call<T>(uriPath: string, payload: unknown): Promise<T | { error: string }> {
  const { baseUrl } = config();
  const body = JSON.stringify(payload);
  const randomKey = `${Date.now()}${randomBytes(6).toString('hex')}`;

  try {
    const response = await fetch(`${baseUrl}${uriPath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: authorization(uriPath, body, randomKey),
        'x-iyzi-rnd': randomKey,
      },
      body,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return { error: `iyzico ${response.status}: ${(await response.text()).slice(0, 200)}` };
    }
    return (await response.json()) as T;
  } catch (error) {
    return { error: `iyzico erişilemedi: ${String(error).slice(0, 150)}` };
  }
}

type IyzicoBase = { status?: string; errorMessage?: string; errorCode?: string };

function failed(response: IyzicoBase | { error: string }): string | null {
  if ('error' in response && response.error) return response.error;
  const body = response as IyzicoBase;
  if (body.status === 'success') return null;
  return body.errorMessage ?? body.errorCode ?? 'iyzico bilinmeyen hata';
}

/** Kuruş cinsinden tam sayıyı iyzico'nun beklediği ondalık dizgiye çevirir. */
function amount(tryValue: number): string {
  return tryValue.toFixed(2);
}

/**
 * Alt üye işyeri payını serbest bırakan/geri çeviren çağrı.
 *
 * İki uç yalnızca adresleriyle ayrılıyor; gövde ve hata işleme aynı. Ayrı ayrı
 * yazılsaydı biri düzeltilip diğeri unutulurdu.
 */
async function itemApproval(uriPath: string, itemTransactionRef: string): Promise<ApprovalResult> {
  if (!isIyzicoConfigured()) return { ok: false, error: 'iyzico yapılandırılmamış.' };
  if (!itemTransactionRef) return { ok: false, error: 'Kalem işlem kimliği yok.' };

  const response = await call<IyzicoBase>(uriPath, {
    locale: 'tr',
    conversationId: itemTransactionRef,
    paymentTransactionId: itemTransactionRef,
  });

  const error = failed(response);
  return error ? { ok: false, error } : { ok: true };
}

export function iyzicoProvider(): PaymentProvider {
  return {
    name: 'iyzico',

    async startCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
      if (!isIyzicoConfigured()) return { ok: false, error: 'iyzico yapılandırılmamış.' };

      const response = await call<
        IyzicoBase & { token?: string; checkoutFormContent?: string; paymentPageUrl?: string }
      >('/payment/iyzipos/checkoutform/initialize/auth/ecom', {
        locale: 'tr',
        conversationId: request.conversationId,
        price: amount(request.amountTRY),
        paidPrice: amount(request.amountTRY),
        currency: 'TRY',
        basketId: request.conversationId,
        paymentGroup: 'PRODUCT',
        callbackUrl: request.callbackUrl,
        buyer: {
          id: request.buyer.id,
          name: request.buyer.name.split(' ')[0] || request.buyer.name,
          surname: request.buyer.name.split(' ').slice(1).join(' ') || request.buyer.name,
          gsmNumber: `+${request.buyer.phone}`,
          // iyzico e-posta zorunlu tutuyor; müşteriden e-posta TOPLAMIYORUZ,
          // bu yüzden yalnızca bu çağrı için türetilmiş bir adres gönderilir.
          // Gerçek bir kutuya düşmez ve hiçbir yerde saklanmaz.
          email: `${request.buyer.id}@misafir.rastla.local`,
          identityNumber: '11111111111',
          registrationAddress: 'Büyükçekmece, İstanbul',
          city: 'Istanbul',
          country: 'Turkey',
          ip: request.buyer.ip ?? '0.0.0.0',
        },
        shippingAddress: {
          contactName: request.buyer.name,
          city: 'Istanbul',
          country: 'Turkey',
          address: 'Büyükçekmece, İstanbul',
        },
        billingAddress: {
          contactName: request.buyer.name,
          city: 'Istanbul',
          country: 'Turkey',
          address: 'Büyükçekmece, İstanbul',
        },
        basketItems: [
          {
            id: request.item.id,
            name: request.item.name,
            category1: request.item.category,
            itemType: 'VIRTUAL',
            price: amount(request.amountTRY),
            // Pazaryeri: bu kalemin geliri hangi alt üye işyerine, ne kadar.
            subMerchantKey: request.submerchantKey,
            subMerchantPrice: amount(request.submerchantAmountTRY),
          },
        ],
      });

      const error = failed(response);
      if (error) return { ok: false, error };

      const body = response as { token?: string; paymentPageUrl?: string };
      if (!body.token) return { ok: false, error: 'iyzico token döndürmedi.' };

      return {
        ok: true,
        token: body.token,
        formUrl: body.paymentPageUrl ?? '',
      };
    },

    async resolve(token: string): Promise<PaymentResult> {
      if (!isIyzicoConfigured()) return { ok: false, error: 'iyzico yapılandırılmamış.' };

      type Detail = IyzicoBase & {
        paymentStatus?: string;
        paymentId?: string;
        conversationId?: string;
        paidPrice?: string;
        currency?: string;
        cardAssociation?: string;
        lastFourDigits?: string;
        // Sepetteki her kalem için ayrı bir işlem. Bizde sepet tek kalemli
        // (bir rezervasyon), bu yüzden ilk eleman alınıyor.
        itemTransactions?: { paymentTransactionId?: string }[];
      };

      const response = await call<Detail>('/payment/iyzipos/checkoutform/auth/ecom/detail', {
        locale: 'tr',
        token,
      });

      const error = failed(response);
      if (error) return { ok: false, error };

      const body = response as Detail;

      if (body.paymentStatus !== 'SUCCESS') {
        return {
          ok: false,
          error: `Ödeme tamamlanmadı (${body.paymentStatus ?? 'bilinmiyor'}).`,
          conversationId: body.conversationId,
        };
      }

      return {
        ok: true,
        providerRef: String(body.paymentId),
        conversationId: String(body.conversationId),
        paidTRY: Number(body.paidPrice),
        currency: body.currency ?? 'TRY',
        cardFamily: body.cardAssociation,
        cardLastFour: body.lastFourDigits,
        itemTransactionRef: body.itemTransactions?.[0]?.paymentTransactionId,
      };
    },

    async approve(itemTransactionRef: string): Promise<ApprovalResult> {
      return itemApproval('/payment/iyzipos/item/approve', itemTransactionRef);
    },

    async disapprove(itemTransactionRef: string): Promise<ApprovalResult> {
      return itemApproval('/payment/iyzipos/item/disapprove', itemTransactionRef);
    },

    async refund(input): Promise<RefundResult> {
      if (!isIyzicoConfigured()) return { ok: false, error: 'iyzico yapılandırılmamış.' };

      const response = await call<IyzicoBase & { paymentId?: string }>('/payment/refund', {
        locale: 'tr',
        conversationId: `refund-${input.providerRef}`,
        paymentTransactionId: input.providerRef,
        price: amount(input.amountTRY),
        currency: 'TRY',
        ip: input.ip ?? '0.0.0.0',
      });

      const error = failed(response);
      if (error) return { ok: false, error };

      return { ok: true, providerRef: String((response as { paymentId?: string }).paymentId ?? '') };
    },

    async createSubmerchant(input: SubmerchantInput): Promise<SubmerchantResult> {
      if (!isIyzicoConfigured()) return { ok: false, error: 'iyzico yapılandırılmamış.' };

      const type =
        input.legalType === 'limited'
          ? 'LIMITED_OR_JOINT_STOCK_COMPANY'
          : input.legalType === 'private'
            ? 'PRIVATE_COMPANY'
            : 'PERSONAL';

      const response = await call<IyzicoBase & { subMerchantKey?: string }>(
        '/onboarding/submerchant',
        {
          locale: 'tr',
          conversationId: input.operatorId,
          subMerchantExternalId: input.operatorId,
          subMerchantType: type,
          address: input.address,
          contactName: input.name,
          contactSurname: '-',
          email: input.email,
          gsmNumber: `+${input.phone}`,
          name: input.legalName,
          iban: input.iban,
          currency: 'TRY',
          ...(type === 'PERSONAL'
            ? { identityNumber: input.identityNumber }
            : {
                taxNumber: input.taxNumber,
                taxOffice: input.taxOffice,
                legalCompanyTitle: input.legalName,
                ...(type === 'PRIVATE_COMPANY' ? { identityNumber: input.identityNumber } : {}),
              }),
        }
      );

      const error = failed(response);
      if (error) return { ok: false, error };

      const key = (response as { subMerchantKey?: string }).subMerchantKey;
      if (!key) return { ok: false, error: 'iyzico alt üye anahtarı döndürmedi.' };

      return { ok: true, submerchantKey: key };
    },
  };
}
