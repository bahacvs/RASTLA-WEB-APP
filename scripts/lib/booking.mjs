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

/**
 * Gönderme butonunun metni dört hâlde farklı: ödemeli/ödemesiz × kod
 * ekranı açık/kapalı. Tek desen hepsini yakalar.
 */
export const SUBMIT = /Rezervasyonu Tamamla|Ödemeye Geç|Kodu Doğrula/;

/**
 * Mesafeli satış onay kutusunu işaretler.
 *
 * Kutu yalnızca online ödeme açıkken görünür ve **zorunludur**; işaretlenmezse
 * tarayıcı formu hiç göndermez ve test "kod ekranı gelmedi" diye takılır.
 * Testin gerçek kullanıcının yolunu izlemesi için işaretleniyor;
 * işaretlenmediğinde ne olduğu verify-payment.mjs içinde ayrıca sınanıyor.
 */
export async function acceptTerms(page) {
  const terms = page.locator('input[name="sozlesme"]');
  if ((await terms.count()) > 0 && !(await terms.isChecked())) await terms.check();
}

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

/**
 * Yeterli yeri olan bir slot seçer ve formun GERÇEKTEN hazır olduğunu doğrular.
 *
 * Tek bir tıklama yetmiyor: slot listesi tarih seçimiyle birlikte yeniden
 * çiziliyor ve sunucu yükluyken tıklama, listeden az sonra kaybolacak eski bir
 * düğmeye denk gelebiliyor. O durumda `slotId` artık listede olmayan bir
 * kimliği gösteriyor ve gönder düğmesi sessizce kapalı kalıyor — testler
 * "önce müsait bir tarih ve saat seçin" diyerek zaman aşımına uğruyordu.
 *
 * Bu yüzden seçimden sonra düğmenin açıldığı doğrulanıyor; açılmazsa sıradaki
 * slot deneniyor.
 */
export async function pickAvailableSlot(page, attempts = 5) {
  const submit = page.getByRole('button', { name: SUBMIT }).first();

  for (let i = 0; i < attempts; i++) {
    const slots = page.locator('button[aria-pressed]:not([disabled])').filter({ hasText: 'yer' });
    const count = await slots.count();
    if (count === 0) return false;

    await slots.nth(Math.min(i, count - 1)).click();

    try {
      await submit.waitFor({ state: 'attached', timeout: 3000 });
      await page.waitForFunction(
        () => {
          const buttons = [...document.querySelectorAll('button[type="submit"]')];
          return buttons.some((b) => !b.disabled);
        },
        { timeout: 3000 }
      );
      return true;
    } catch {
      // Seçim tutmadı; sıradaki slotu dene.
      await page.waitForTimeout(300);
    }
  }

  return false;
}

/**
 * Uçtan uca rezervasyon: slot seç, bilgileri gir, gerekiyorsa kodu doğrula.
 *
 * `stopAtPayment` ile ödeme sağlayıcısına yönlendirme YAKALANIR ve durdurulur.
 * Ödeme testinin buna ihtiyacı var: geri çağrı henüz işlenmemişken
 * rezervasyonun `pending_payment` durumunda beklediğini ve tek bir token'ın
 * eşzamanlı isteklerde ne yaptığını ancak o an sınayabilirsiniz.
 *
 * @returns {Promise<{ code?: string, paymentUrl?: string, error?: string, slotLabel?: string }>}
 */
export async function book(page, options) {
  const {
    baseUrl,
    slug,
    name,
    phone,
    logPath = process.env.SERVER_LOG,
    slotLabel = false,
    stopAtPayment = false,
    /** Rezervasyon sayfasına eklenecek sorgu dizesi (paylaşım linki kodu gibi). */
    query = '',
    /**
     * Yetişkin sayısı. Varsayılan ekranın kendi varsayılanı (2).
     *
     * Sayaç düğmeye basılarak artırılıyor, alana yazılarak değil: grup
     * indirimi testinin gerçek kullanıcının yolunu izlemesi gerekiyor —
     * duruma doğrudan değer yazmak, ekrandaki sınırların (kalan yer) hiç
     * çalışmadığı bir yol açardı.
     */
    people = null,
    /**
     * Her GÖNDERİMDEN ÖNCE çağrılır — formu kurcalamak için.
     *
     * Her seferinde çağrılıyor çünkü doğrulama kodu ekranı formu yeniden
     * çiziyor ve ilk gönderimden önce eklenen alanlar kayboluyor. Bir kez
     * çağrılsaydı test, kurcalanmamış bir formu gönderip "sunucu reddetti"
     * sanırdı — yani doğru sonucu yanlış sebeple verirdi.
     */
    beforeSubmit = null,
  } = options;

  const submit = async () => {
    if (beforeSubmit) await beforeSubmit(page);
    await page.getByRole('button', { name: SUBMIT }).first().click();
  };

  // Ödeme adımına giden ilk istek yakalanıp DURDURULUR. Desen sayfanın da geri
  // çağrının da önüne geçecek kadar geniş: sağlayıcı hangi sırayla giderse
  // gitsin akış ödeme öncesinde donar.
  let captured = null;
  if (stopAtPayment) {
    await page.route('**/odeme/**', async (route) => {
      captured ??= route.request().url();
      await route.abort();
    });
  }

  /** Gönderimden sonra varılan yer: ya bilet ya da yakalanmış ödeme adresi. */
  async function arrive(timeout) {
    if (!stopAtPayment) {
      await page.waitForURL(/\/bilet\//, { timeout });
      return { code: ticketCode(page) };
    }

    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (captured) return { paymentUrl: captured };
      await page.waitForTimeout(100);
    }
    throw new Error('ödeme yönlendirmesi yakalanamadı');
  }

  await page.goto(`${baseUrl}/rezervasyon/${slug}${query ? `?${query}` : ''}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(400);

  const first = page
    .locator('button[aria-pressed]:not([disabled])')
    .filter({ hasText: 'yer' })
    .first();
  if ((await first.count()) === 0) return { error: 'boş slot yok' };

  const label = slotLabel ? await first.innerText() : undefined;

  // Kişi sayısı slot seçiminden ÖNCE ayarlanıyor: seçilebilir slotlar kalan
  // yere göre süzülüyor ve 5 kişilik bir grup için 3 yeri kalan saat zaten
  // seçilmemeli. Sonra ayarlansaydı seçim geçersizleşir, gönder düğmesi
  // sessizce kapanırdı.
  if (people !== null) {
    const plus = page.getByRole('button', { name: 'Yetişkin sayısını artır' });
    for (let i = 2; i < people; i++) await plus.click();
  }

  if (!(await pickAvailableSlot(page))) return { error: 'slot seçilemedi', slotLabel: label };

  await page.getByLabel('Ad Soyad').fill(name);
  await page.getByLabel('Telefon').fill(phone);

  await acceptTerms(page);
  // Butonun metni işletme online ödemeye açıksa değişiyor. Test hangi
  // kurulumda koştuğunu bilmek zorunda kalmasın diye ikisi de kabul edilir.
  await submit();

  // Doğrulama istendi mi? Oturumu doğrulanmış bir cihazda istenmez.
  try {
    return { ...(await arrive(6000)), slotLabel: label };
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
  await submit();

  try {
    return { ...(await arrive(15000)), slotLabel: label };
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
