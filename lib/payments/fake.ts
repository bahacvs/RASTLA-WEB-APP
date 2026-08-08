import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db/index.mjs';
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
  const client = await db();

  await client.run(
    `CREATE TABLE IF NOT EXISTS fake_payment_sessions (
       token TEXT PRIMARY KEY,
       conversation_id TEXT NOT NULL,
       amount_try INTEGER NOT NULL,
       outcome TEXT NOT NULL DEFAULT 'success',
       paid_try INTEGER,
       created_at TEXT NOT NULL
     )`
  );

  // Onay çağrılarının defteri.
  //
  // Sağlayıcıya gerçekten gidilmediği için, "hizmet verilince pay serbest
  // bırakıldı, gelmeyince geri çevrildi" iddiasının sınanabilmesinin tek yolu
  // çağrının bir iz bırakması. Tabloda tutuluyor, bellekte değil: doğrulama
  // betikleri ayrı işletim sistemi süreçleri açıyor ve bellekteki bir kayıt o
  // süreçlerden görünmezdi.
  await client.run(
    `CREATE TABLE IF NOT EXISTS fake_item_approvals (
       id TEXT PRIMARY KEY,
       item_ref TEXT NOT NULL,
       action TEXT NOT NULL,
       created_at TEXT NOT NULL
     )`
  );
}

/**
 * Test sağlayıcısının kalem işlem kimliği.
 *
 * Ödeme kimliğinden (`providerRef`) BİLEREK farklı türetiliyor: gerçek
 * sağlayıcıda da farklılar ve kodun yanlışlıkla ödeme kimliğiyle onay çağırması
 * testte fark edilmeli, üretimde değil.
 */
function itemRefFor(token: string): string {
  return `fake-item-${token.slice(0, 12)}`;
}

async function recordApproval(itemRef: string, action: 'approve' | 'disapprove') {
  if (!itemRef) return { ok: false as const, error: 'Kalem işlem kimliği yok.' };

  await ensureTable();
  await (
    await db()
  ).run(
    `INSERT INTO fake_item_approvals (id, item_ref, action, created_at) VALUES (?, ?, ?, ?)`,
    [randomBytes(12).toString('hex'), itemRef, action, new Date().toISOString()]
  );

  return { ok: true as const };
}

/**
 * Bir kalem için kaydedilen onay çağrıları — yalnızca doğrulama betikleri için.
 *
 * Sayı da döndürülüyor çünkü sınanan iddialardan biri "tam olarak bir kez":
 * eşzamanlı okutma denemelerinden kaçının sağlayıcıya ulaştığı ancak sayılarak
 * görülebilir.
 */
export async function fakeApprovals(itemRef: string): Promise<{ action: string }[]> {
  await ensureTable();
  return (await db()).all<{ action: string }>(
    'SELECT action FROM fake_item_approvals WHERE item_ref = ? ORDER BY created_at',
    [itemRef]
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
        itemTransactionRef: itemRefFor(token),
      };
    },

    async refund(input): Promise<RefundResult> {
      return { ok: true, providerRef: `fake-refund-${input.providerRef}` };
    },

    async approve(itemTransactionRef: string): Promise<ApprovalResult> {
      return recordApproval(itemTransactionRef, 'approve');
    },

    async disapprove(itemTransactionRef: string): Promise<ApprovalResult> {
      return recordApproval(itemTransactionRef, 'disapprove');
    },

    async createSubmerchant(input: SubmerchantInput): Promise<SubmerchantResult> {
      return { ok: true, submerchantKey: `fake-submerchant-${input.operatorId}` };
    },
  };
}
