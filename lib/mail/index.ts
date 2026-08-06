/**
 * E-posta gönderimi.
 *
 * SMS ile aynı desen: `MAIL_PROVIDER` tanımsızsa **console** kullanılır ve
 * ileti sunucu günlüğüne yazılır. Doğrulama betikleri hiçbir dış hesap
 * gerektirmeden çalışır.
 *
 * Resend uygulaması düz `fetch` — yeni bir bağımlılık eklenmedi. İstek
 * sunucudan gidiyor, tarayıcıdan değil; bu yüzden `verify-offline.mjs`'in
 * ölçtüğü "tarayıcı yalnızca kendi alan adımıza ve harita sağlayıcısına istek
 * atar" güvencesi etkilenmez.
 */

export type MailMessage = {
  to: string[];
  subject: string;
  /** Düz metin. Uyarı e-postaları HTML gerektirmiyor; sade metin her yerde okunur. */
  text: string;
};

export type MailResult = { ok: true; providerRef?: string } | { ok: false; error: string };

export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<MailResult>;
}

let cached: MailProvider | null = null;

export function mailProvider(): MailProvider {
  if (cached) return cached;

  const name = process.env.MAIL_PROVIDER ?? (process.env.RESEND_API_KEY ? 'resend' : 'console');

  cached = name === 'resend' ? resendProvider() : consoleProvider();
  return cached;
}

export function resetMailProvider(): void {
  cached = null;
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (message.to.length === 0) {
    return { ok: false, error: 'Alıcı tanımlı değil (ALERT_EMAIL_TO).' };
  }
  return mailProvider().send(message);
}

/**
 * Uyarıların gideceği adresler — ihlal müdahale planındaki sorumlular.
 * Virgülle ayrılır: ALERT_EMAIL_TO=guvenlik@ornek.com,teknik@ornek.com
 */
export function alertRecipients(): string[] {
  return (process.env.ALERT_EMAIL_TO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ------------------------------------------------------------------ console

function consoleProvider(): MailProvider {
  return {
    name: 'console',
    async send(message) {
      console.log(
        `[mail:console] -> ${message.to.join(', ')}\n  ${message.subject}\n${message.text}`
      );
      return { ok: true, providerRef: 'console' };
    },
  };
}

// ------------------------------------------------------------------- Resend

function resendProvider(): MailProvider {
  const key = process.env.RESEND_API_KEY ?? '';
  const from = process.env.MAIL_FROM ?? '';

  return {
    name: 'resend',
    async send(message) {
      if (!key || !from) return { ok: false, error: 'Resend yapılandırması eksik.' };

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: message.to,
            subject: message.subject,
            text: message.text,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          return { ok: false, error: `Resend ${response.status}: ${await response.text()}` };
        }

        const body = (await response.json()) as { id?: string };
        return { ok: true, providerRef: body.id };
      } catch (error) {
        return { ok: false, error: `Resend erişilemedi: ${String(error).slice(0, 120)}` };
      }
    },
  };
}
