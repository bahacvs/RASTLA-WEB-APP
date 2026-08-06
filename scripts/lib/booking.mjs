/**
 * Rezervasyon oluşturma yardımcısı — numara doğrulaması dahil.
 *
 * Rezervasyon artık iki adımlı: numara doğrulanmamışsa kod ekranı gelir. Her
 * doğrulama betiği bu akışı kendi içinde yeniden yazsaydı, biri güncellenip
 * diğerleri unutulurdu; tek yerde toplandı.
 *
 * Kod, SUNUCU GÜNLÜĞÜNDEN okunur. Uygulama kodu hiçbir koşulda tarayıcıya
 * döndürmüyor (bkz. lib/verification.ts), dolayısıyla test de gerçek
 * kullanıcının izlediği yolu izliyor: SMS sağlayıcısı yapılandırılmadığında
 * mesaj konsola düşer.
 */
import { existsSync, readFileSync } from 'node:fs';

/** Sunucu günlüğünden bir numaraya gönderilen SON kodu okur. */
export function codeFromLog(phone, logPath = process.env.SERVER_LOG) {
  if (!logPath || !existsSync(logPath)) return null;

  const last4 = phone.replace(/\D/g, '').slice(-4);
  const lines = readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('[sms:console]') && l.includes(last4));

  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(/\b(\d{6})\b/);
    if (match) return match[1];
  }
  return null;
}

/** Yeterli yeri olan ilk slotu seçer. Varsayılan seçime güvenmek kırılgandır:
 *  önceki koşumlar o slotu doldurmuş olabilir. */
export async function pickAvailableSlot(page) {
  const slot = page
    .locator('button[aria-pressed]:not([disabled])')
    .filter({ hasText: 'yer' })
    .first();
  if ((await slot.count()) === 0) return false;
  await slot.click();
  return true;
}

/**
 * Uçtan uca rezervasyon: slot seç, bilgileri gir, gerekiyorsa kodu doğrula.
 *
 * @returns {Promise<{ code?: string, error?: string, slotLabel?: string }>}
 */
export async function book(page, options) {
  const {
    baseUrl,
    slug,
    name,
    phone,
    logPath = process.env.SERVER_LOG,
    slotLabel = false,
  } = options;

  await page.goto(`${baseUrl}/rezervasyon/${slug}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const slot = page
    .locator('button[aria-pressed]:not([disabled])')
    .filter({ hasText: 'yer' })
    .first();
  if ((await slot.count()) === 0) return { error: 'boş slot yok' };

  const label = slotLabel ? await slot.innerText() : undefined;
  await slot.click();

  await page.getByLabel('Ad Soyad').fill(name);
  await page.getByLabel('Telefon').fill(phone);
  await page.getByRole('button', { name: /Rezervasyonu Tamamla/ }).first().click();

  // Doğrulama istendi mi? Oturumu doğrulanmış bir cihazda istenmez.
  try {
    await page.waitForURL(/\/bilet\//, { timeout: 6000 });
    return { code: ticketCode(page), slotLabel: label };
  } catch {
    // Kod ekranı gelmiş olabilir; gelmediyse aşağıdaki kontrol hatayı döndürür.
  }

  if ((await page.locator('#code').count()) === 0) {
    const error = await page
      .locator('[role="alert"]')
      .first()
      .innerText()
      .catch(() => 'bilinmeyen hata');
    return { error, slotLabel: label };
  }

  const code = codeFromLog(phone, logPath);
  if (!code) return { error: 'doğrulama kodu günlükten okunamadı (SERVER_LOG?)', slotLabel: label };

  await page.fill('#code', code);
  await page.getByRole('button', { name: /Tamamla/ }).first().click();

  try {
    await page.waitForURL(/\/bilet\//, { timeout: 15000 });
    return { code: ticketCode(page), slotLabel: label };
  } catch {
    const error = await page
      .locator('[role="alert"]')
      .first()
      .innerText()
      .catch(() => 'bilet sayfasına ulaşılamadı');
    return { error, slotLabel: label };
  }
}

function ticketCode(page) {
  return decodeURIComponent(new URL(page.url()).pathname.split('/').pop());
}

/**
 * Test numaraları — her betik kendine ait bir aralık kullanır.
 *
 * Telefon kullanıcının kimliğidir; iki betik aynı numarayı kullanırsa biri
 * diğerinin kullanıcı kaydını ve oturumunu etkiler.
 */
export function testPhone(prefix) {
  const national = `${prefix}${Date.now().toString().slice(-7)}`.slice(0, 10);
  return {
    normalized: `90${national}`,
    display: `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(
      6,
      8
    )} ${national.slice(8, 10)}`,
  };
}
