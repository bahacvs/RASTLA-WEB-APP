import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db/index.mjs';
import type {
  CheckoutRequest,
  CheckoutSession,
  PaymentProvider,
  PaymentResult,
  RefundResult,
  SubmerchantInput,
  SubmerchantResult,
} from './types';

/**
 * Test sağlayıcısı — iyzico ile AYNI sözleşmeyi uygular.
 *
 * Var olma sebebi: ödeme akışının doğruluk iddiaları (kapasitenin ödeme
 * boyunca tutulması, süre aşımında bir kez iade edilmesi, eşzamanlı geri
 * çağrılardan yalnızca birinin onaylaması, kurcalanmış tutarın reddedilmesi)
 * gerçek bir kart çekilmeden kanıtlanabilmeli. Bu iddiaların hiçbiri
 * iyzico'ya özgü değil; sağlayıcıdan bağımsız olarak bizim kodumuzda duruyor.
 *
 * Gerçek sağlayıcıya özgü olan tek şey imzalama ve alan adları; onlar ilk
 * gerçek anahtarla sınanacak ve bu sınır raporda açıkça belirtiliyor.
 *
 * **Yalnızca `PAYMENT_PROVIDER=fake` iken devreye girer.** Üretimde
 * kullanılması, ödeme almadan bilet üretmek demek olurdu.
 */

/**
 * Sahte oturumlar veritabanında tutulur, bellekte değil.
 *
 * Doğrulama betikleri ayrı işletim sistemi süreçleri açıyor; bellekte tutulan
 * bir harita o süreçlerden görünmezdi ve eşzamanlılık testi yapılamazdı.
 */
async function ensureTable() {
  await (
    await db()
  ).run(
    `CREATE TABLE IF NOT EXISTS fake_payment_sessions (
       token TEXT PRIMARY KEY,
       conversation_id TEXT NOT NULL,
       amount_try INTEGER NOT NULL,
       outcome TEXT NOT NULL DEFAULT 'success',
       paid_try INTEGER,
       created_at TEXT NOT NULL
     )`
  );
}

export function fakeProvider(): PaymentProvider {
  return {
    name: 'fake',

    async startCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
      await ensureTable();
      const token = randomBytes(16).toString('base64url');

      await (
        await db()
      ).run(
        `INSERT INTO fake_payment_sessions
           (token, conversation_id, amount_try, outcome, paid_try, created_at)
         VALUES (?, ?, ?, 'success', ?, ?)`,
        [
          token,
          request.conversationId,
          request.amountTRY,
          request.amountTRY,
          new Date().toISOString(),
        ]
      );

      // Gerçek sağlayıcıda burası iyzico'nun barındırdığı formun adresi.
      // Testte de bir SAYFA veriliyor, doğrudan geri çağrı adresi değil:
      // iyzico'nun formu bittiğinde geri çağrıya bir POST atıyor ve akışın
      // sınanması gereken hâli bu. Doğrudan geri çağrıya yönlendirseydik POST
      // yolu hiç çalışmaz, üstelik aynı köken olduğu için tarayıcı gerçek bir
      // gezinme yerine uygulama içi bir geçiş yapar ve adres çubuğu ödeme
      // adresinde takılı kalırdı.
      const formUrl = new URL('/odeme/test-formu', request.callbackUrl);
      formUrl.searchParams.set('token', token);

      return { ok: true, token, formUrl: formUrl.toString() };
    },

    async resolve(token: string): Promise<PaymentResult> {
      await ensureTable();
      const row = await (
        await db()
      ).get<{ conversation_id: string; amount_try: number; outcome: string; paid_try: number }>(
        'SELECT * FROM fake_payment_sessions WHERE token = ?',
        [token]
      );

      if (!row) return { ok: false, error: 'Ödeme oturumu bulunamadı.' };
      if (row.outcome === 'failure') {
        return { ok: false, error: 'Kart reddedildi.', conversationId: row.conversation_id };
      }

      return {
        ok: true,
        providerRef: `fake-${token.slice(0, 12)}`,
        conversationId: row.conversation_id,
        // `paid_try` testte kasten değiştirilebiliyor: kurcalanmış tutarın
        // reddedildiğini kanıtlamanın yolu bu.
        paidTRY: Number(row.paid_try),
        currency: 'TRY',
        cardFamily: 'Test Kart',
        cardLastFour: '4242',
      };
    },

    async refund(input): Promise<RefundResult> {
      return { ok: true, providerRef: `fake-refund-${input.providerRef}` };
    },

    async createSubmerchant(input: SubmerchantInput): Promise<SubmerchantResult> {
      return { ok: true, submerchantKey: `fake-submerchant-${input.operatorId}` };
    },
  };
}
