import { redirect } from 'next/navigation';
import { resolveCallback } from '@/lib/payments/flow';
import { requestContext } from '@/lib/request-context';

/**
 * Ödeme sağlayıcısının dönüş adresi.
 *
 * **Bu isteğin gövdesine güvenilmez.** iyzico buraya bir `token` POST eder;
 * gövdedeki başka hiçbir alan okunmaz. Sonuç, token ile sağlayıcıya sorularak
 * öğrenilir (bkz. lib/payments/flow.ts). Gövdedeki "başarılı" alanına
 * güvenilseydi, adresi bilen herkes uydurma bir istekle bedava bilet
 * üretebilirdi — bu uç kimlik doğrulaması olmadan herkese açık olmak zorunda,
 * çünkü isteği gönderen sağlayıcının sunucusu.
 *
 * Uç **idempotenttir**: sağlayıcı tekrar denese, kullanıcı sayfayı yenilese ya
 * da webhook ile tarayıcı dönüşü aynı anda gelse de rezervasyon tam olarak bir
 * kez onaylanır. Garanti buradaki kodda değil, `confirmBookingPayment`
 * içindeki tek koşullu UPDATE'te.
 */

export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // POST: iyzico form-encoded gövdede yollar. GET: elle dönüş ve test.
  let token = url.searchParams.get('token') ?? '';
  if (!token && request.method === 'POST') {
    try {
      const form = await request.formData();
      token = String(form.get('token') ?? '');
    } catch {
      // Gövde okunamadıysa token da yok; aşağıdaki kontrol yakalar.
    }
  }

  if (!token) redirect('/odeme/sonuc?durum=eksik');

  const outcome = await resolveCallback(token, await requestContext());

  if (outcome.ok) redirect(`/bilet/${outcome.code}?yeni=1`);

  // Sebep kullanıcıya ayrıntısız bildirilir: "tutar uyuşmadı" mesajı,
  // kurcalayan birine hangi kontrolün yakaladığını söylerdi. Ayrıntı işlem
  // günlüğünde ve `payment.denied` kaydında duruyor.
  redirect(`/odeme/sonuc?durum=${outcome.reason === 'unknown_token' ? 'eksik' : 'basarisiz'}`);
}

export const GET = handle;
export const POST = handle;
