'use server';

import { redirect } from 'next/navigation';
import { normalizeEmail, signUpOperator } from '@/lib/db/operators';
import { normalizePhone } from '@/lib/db/users';
import { setOperatorSession } from '@/lib/session';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';
import { bucketKey, consume, describeRetry, LIMITS } from '@/lib/db/rate-limit';

/**
 * İşletmenin kendi başvurusu.
 *
 * Bugüne kadar hesabı elle biz açıyorduk; her işletme bir insan-iş demekti ve
 * bu duvar yıkılmadan onuncu işletmeye çıkmak mümkün değildi.
 *
 * **Başvuru doğrulama değildir.** İşletme `basvuru` durumunda doğuyor: rozet
 * görünmüyor, ilanları RASTLA incelemesine düşüyor. Kendi kendini
 * doğrulayabilen bir kayıt, rozetin arkasındaki tek insan kontrolünü ortadan
 * kaldırırdı — ve o rozet müşteriye bir şey vaat ediyor.
 */

export type SignupState = { error?: string; field?: string };

/** Parola alt sınırı — `operator-account.mjs` ile aynı ölçüt. */
const MIN_PASSWORD = 10;

export async function operatorSignupAction(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  const context = await requestContext();

  // Sınır, kayıt yazılmadan ÖNCE. Sonra uygulansaydı reddedilen istek yine
  // bir işletme satırı bırakmış olurdu.
  if (context.ip) {
    const gate = await consume(
      bucketKey('operator-signup:ip', context.ip),
      LIMITS.operatorSignupByIp
    );
    if (!gate.allowed) {
      return {
        error: `Kısa sürede çok fazla başvuru yapıldı. ${describeRetry(
          gate.retryAfterSeconds
        )} sonra tekrar deneyin.`,
      };
    }
  }

  const operatorName = String(formData.get('operatorName') ?? '').trim();
  const userName = String(formData.get('userName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const phoneRaw = String(formData.get('phone') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (operatorName.length < 2) {
    return { error: 'İşletme adını girin.', field: 'operatorName' };
  }
  if (userName.length < 2) return { error: 'Adınızı ve soyadınızı girin.', field: 'userName' };
  if (!email.includes('@') || email.length < 5) {
    return { error: 'Geçerli bir e-posta girin.', field: 'email' };
  }

  // Telefon ZORUNLU: işletme girişinde ikinci faktör buraya gidiyor. Numarasız
  // açılan hesap parolayla giriyor ve ekip ekranında uyarı alıyor — yeni
  // hesapları o duruma doğurmanın bir sebebi yok.
  const phone = normalizePhone(phoneRaw);
  if (phone.length < 12) {
    return { error: 'Geçerli bir cep telefonu girin.', field: 'phone' };
  }

  if (password.length < MIN_PASSWORD) {
    return {
      error: `Parola en az ${MIN_PASSWORD} karakter olmalı.`,
      field: 'password',
    };
  }

  const result = await signUpOperator({
    operatorName,
    contactEmail: normalizeEmail(email),
    userName,
    email,
    phone,
    password,
  });

  if (!result.ok) {
    // Hesabın varlığı burada gizlenmiyor: kişi zaten kendi e-postasını
    // yazıyor ve "giriş yapın" demek onu doğru yere götürüyor. Girişte
    // gizlemek başka bir mesele — orada e-postayı DENEYEN bir saldırgan var.
    return {
      error: 'Bu e-postayla bir hesap zaten var. Giriş yapmayı deneyin.',
      field: 'email',
    };
  }

  await record({
    action: 'operator_user.created',
    actorType: 'anonymous',
    operatorId: result.operator.id,
    targetType: 'operator_user',
    targetId: result.user.id,
    ...context,
    // Parola ve telefon günlüğe YAZILMAZ; kayıt hangi hesabı işaret ettiğini
    // zaten biliyor.
    meta: { kaynak: 'self-servis', isletme: operatorName },
  });

  // Oturum doğrudan açılıyor: kişi az önce parolayı kendisi belirledi, onu
  // giriş ekranına geri göndermek hiçbir şey doğrulamaz, yalnızca yorar.
  // İkinci faktör bir sonraki girişte devreye giriyor.
  await setOperatorSession(result.user.id);
  redirect('/isletme/aktiviteler/sihirbaz');
}
