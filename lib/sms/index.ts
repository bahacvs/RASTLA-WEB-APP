/**
 * SMS gönderimi.
 *
 * Sağlayıcı `SMS_PROVIDER` ile seçilir; tanımsızsa **console** kullanılır ve
 * mesaj sunucu günlüğüne yazılır. Bu bilinçli: geliştirme ve doğrulama
 * betikleri hiçbir dış hesap, kredi ya da anahtar gerektirmeden çalışsın.
 * Gerçek sağlayıcı yalnızca anahtar verildiğinde devreye girer.
 *
 * ---
 *
 * **İYS (İleti Yönetim Sistemi) uyarısı — buradaki mesajlar TİCARİ DEĞİLDİR.**
 *
 * Kullanıcının kendi başlattığı doğrulama akışına verilen yanıt ticari ileti
 * sayılmaz ve İYS onayı gerektirmez. Ancak bir OTP mesajına tek cümle
 * pazarlama içeriği eklenirse (kampanya, indirim, "bizi takip edin") mesajın
 * TAMAMI ticari ileti hâline gelir ve izin gerektirir.
 *
 * Bu yüzden şablonlar `lib/sms/messages.ts` içinde toplandı ve pazarlama
 * içeriği eklenmemesi kural: yeni bir mesaj eklerken oraya bakın.
 */

export type SmsResult = { ok: true; providerRef?: string } | { ok: false; error: string };

export interface SmsProvider {
  readonly name: string;
  send(phone: string, message: string): Promise<SmsResult>;
}

let cached: SmsProvider | null = null;

export function smsProvider(): SmsProvider {
  if (cached) return cached;

  const name = process.env.SMS_PROVIDER ?? (process.env.NETGSM_USERCODE ? 'netgsm' : 'console');

  cached = name === 'netgsm' ? netgsmProvider() : consoleProvider();
  return cached;
}

/** Testler sağlayıcıyı değiştirdiğinde önbelleği temizler. */
export function resetSmsProvider(): void {
  cached = null;
}

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  return smsProvider().send(phone, message);
}

// ------------------------------------------------------------------ console

/**
 * Hiçbir yere göndermeyen sağlayıcı.
 *
 * Kodu konsola yazar; geliştirici ekranda görüp girebilir. Numaranın son dört
 * hanesi dışındaki kısmı maskelenir — geliştirme günlükleri de çoğu zaman bir
 * yerlere akar ve orada tam telefon numarası bulunmamalı.
 */
function consoleProvider(): SmsProvider {
  return {
    name: 'console',
    async send(phone, message) {
      console.log(`[sms:console] ${maskPhone(phone)} <- ${message}`);
      return { ok: true, providerRef: 'console' };
    },
  };
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length <= 4 ? '****' : `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

// ------------------------------------------------------------------- Netgsm

/**
 * Netgsm — Türkiye'de yaygın, OTP için uygun.
 *
 * XML API'si kullanılıyor; JSON uçları hesabın ürününe göre değişebiliyor,
 * XML her hesapta aynı. Cevap gövdesi "00" ya da "01" ile başlıyorsa başarılı,
 * aksi hâlde hata kodu döner.
 */
function netgsmProvider(): SmsProvider {
  const usercode = process.env.NETGSM_USERCODE ?? '';
  const password = process.env.NETGSM_PASSWORD ?? '';
  const header = process.env.NETGSM_HEADER ?? '';

  return {
    name: 'netgsm',
    async send(phone, message) {
      if (!usercode || !password || !header) {
        return { ok: false, error: 'Netgsm yapılandırması eksik.' };
      }

      const body = `<?xml version="1.0" encoding="UTF-8"?>
<mainbody>
  <header>
    <company dil="TR">Netgsm</company>
    <usercode>${escapeXml(usercode)}</usercode>
    <password>${escapeXml(password)}</password>
    <type>1:n</type>
    <msgheader>${escapeXml(header)}</msgheader>
  </header>
  <body>
    <msg><![CDATA[${message}]]></msg>
    <no>${escapeXml(phone.replace(/\D/g, ''))}</no>
  </body>
</mainbody>`;

      try {
        const response = await fetch('https://api.netgsm.com.tr/sms/send/xml', {
          method: 'POST',
          headers: { 'content-type': 'text/xml; charset=utf-8' },
          body,
          signal: AbortSignal.timeout(15000),
        });

        const text = (await response.text()).trim();
        // "00 <jobid>" ya da "01 <jobid>" başarı; tek başına "20", "30" vb. hata.
        if (/^0[01]\b/.test(text)) {
          return { ok: true, providerRef: text.split(/\s+/)[1] };
        }
        return { ok: false, error: `Netgsm hata kodu: ${text}` };
      } catch (error) {
        return { ok: false, error: `Netgsm erişilemedi: ${String(error).slice(0, 120)}` };
      }
    },
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
