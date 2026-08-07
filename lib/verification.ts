import { checkCode, issueCode, type VerificationPurpose } from '@/lib/db/verifications';
import {
  bucketKey,
  consume,
  describeRetry,
  LIMITS,
  type LimitRule,
} from '@/lib/db/rate-limit';
import { record } from '@/lib/db/audit';
import { requestContext, type RequestContext } from '@/lib/request-context';
import { maskPhone } from '@/lib/sms';

/**
 * Doğrulama kodu gönderme ve doğrulama — iki akışın ortak gövdesi.
 *
 * Müşteri rezervasyonu ile işletme 2FA'sı aynı kuralları paylaşır: aynı hız
 * sınırı, aynı deneme sayacı, aynı günlük kayıtları. Ayrı ayrı yazılsaydı
 * biri sıkılaştırılıp diğeri unutulurdu.
 *
 * **Kod hiçbir günlük satırına yazılmaz.** Numara da maskelenerek yazılır:
 * işlem günlüğü zaten hangi kişiyi işaret ettiğini biliyor, numarayı ikinci
 * bir yerde çoğaltmanın tek etkisi bir ihlalde kapsamı büyütmek olurdu.
 */

export type SendOutcome = { ok: true; expiresAt: string } | { ok: false; error: string };

/**
 * Kod üretir, SMS'i gönderir ve olayı günlüğe yazar.
 *
 * SMS gönderimi başarısız olsa bile kod üretilmiş sayılır ve hata kullanıcıya
 * gösterilir; kodu geri almaya çalışmak yarış açardı ve zaten 5 dakikada
 * kendiliğinden ölüyor.
 */
export async function sendVerificationCode(input: {
  phone: string;
  purpose: VerificationPurpose;
  operatorUserId?: string | null;
  message: (code: string) => string;
  context?: RequestContext;
}): Promise<SendOutcome> {
  const context = input.context ?? (await requestContext());

  const gates: Array<[string, LimitRule]> = [
    [bucketKey(`otp:${input.purpose}`, input.phone), LIMITS.otpByPhone],
  ];
  if (context.ip) gates.push([bucketKey('otp:ip', context.ip), LIMITS.otpByIp]);

  for (const [bucket, rule] of gates) {
    const gate = await consume(bucket, rule);
    if (!gate.allowed) {
      await record({
        action: 'otp.failed',
        actorType: 'anonymous',
        outcome: 'denied',
        ...context,
        meta: { purpose: input.purpose, phone: maskPhone(input.phone), reason: 'rate_limited' },
      });
      return {
        ok: false,
        error: `Çok fazla kod istendi. ${describeRetry(gate.retryAfterSeconds)} sonra tekrar deneyin.`,
      };
    }
  }

  const issued = await issueCode({
    phone: input.phone,
    purpose: input.purpose,
    operatorUserId: input.operatorUserId,
  });

  // Sağlayıcı çağrısı burada, içe aktarma tepede değil: lib/sms sunucuya özgü
  // ve bu modül yalnızca sunucu eylemlerinden çağrılıyor.
  warnIfSmsUnconfigured();
  const { sendSms } = await import('@/lib/sms');
  const sent = await sendSms(input.phone, input.message(issued.code));

  await record({
    action: 'otp.sent',
    actorType: 'anonymous',
    outcome: sent.ok ? 'success' : 'failure',
    ...context,
    // KOD YOK. Yalnızca hangi amaçla, hangi maskeli numaraya.
    meta: { purpose: input.purpose, phone: maskPhone(input.phone), provider: sent.ok },
  });

  if (!sent.ok) {
    return { ok: false, error: 'Kod gönderilemedi. Lütfen biraz sonra tekrar deneyin.' };
  }

  // Kod HİÇBİR koşulda istemciye döndürülmez — "yalnızca geliştirmede" diye
  // eklenmiş bir yol, yanlış yapılandırılmış bir üretim dağıtımında ikinci
  // faktörü tamamen anlamsız kılardı. Sağlayıcı yokken kod sunucu günlüğüne
  // düşer; geliştirici ve doğrulama betikleri oradan okur.
  return { ok: true, expiresAt: issued.expiresAt };
}

export type VerifyOutcome =
  | { ok: true; operatorUserId: string | null }
  | { ok: false; error: string };

const MESSAGES: Record<string, string> = {
  not_found: 'Doğrulama kodu bulunamadı. Yeni kod isteyin.',
  expired: 'Kodun süresi doldu. Yeni kod isteyin.',
  too_many_attempts: 'Çok fazla yanlış deneme. Yeni kod isteyin.',
  wrong_code: 'Kod hatalı.',
};

export async function verifyCode(input: {
  phone: string;
  purpose: VerificationPurpose;
  code: string;
  context?: RequestContext;
}): Promise<VerifyOutcome> {
  const context = input.context ?? (await requestContext());
  const result = await checkCode({
    phone: input.phone,
    purpose: input.purpose,
    code: input.code.replace(/\D/g, ''),
  });

  if (!result.ok) {
    await record({
      action: 'otp.failed',
      actorType: 'anonymous',
      outcome: 'failure',
      ...context,
      meta: { purpose: input.purpose, phone: maskPhone(input.phone), reason: result.reason },
    });
    return { ok: false, error: MESSAGES[result.reason] ?? 'Kod doğrulanamadı.' };
  }

  await record({
    action: 'otp.verified',
    actorType: 'anonymous',
    ...context,
    meta: { purpose: input.purpose, phone: maskPhone(input.phone) },
  });

  return { ok: true, operatorUserId: result.operatorUserId };
}

/** Gerçek bir SMS sağlayıcısı yapılandırılmış mı. */
export function isConsoleSms(): boolean {
  const provider = process.env.SMS_PROVIDER ?? (process.env.NETGSM_USERCODE ? 'netgsm' : 'console');
  return provider === 'console';
}

/**
 * Üretimde sağlayıcısız çalışıldığını yüksek sesle söyler.
 *
 * Bu durumda kodlar yalnızca sunucu günlüğüne yazılır, yani kimseye ulaşmaz ve
 * doğrulama fiilen çalışmaz. Sessizce devam etmek, sorunun canlıda müşteri
 * şikâyetiyle fark edilmesi demek olurdu.
 */
let warned = false;
export function warnIfSmsUnconfigured(): void {
  if (warned || !isConsoleSms() || process.env.NODE_ENV !== 'production') return;
  warned = true;
  console.warn(
    '[sms] UYARI: SMS sağlayıcısı yapılandırılmamış. Doğrulama kodları ' +
      'yalnızca bu günlüğe yazılıyor ve kullanıcıya ULAŞMIYOR. ' +
      'Bkz. KURULUM.md — NETGSM_USERCODE.'
  );
}
