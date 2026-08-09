/**
 * Görsel yüklemenin testi.
 *
 * Sınananlar:
 *   1. `.jpg` uzantılı ve `image/jpeg` beyan eden SAHTE bir dosya reddedilir —
 *      karar beyana değil dosyanın gerçek sihirli baytlarına dayanır.
 *   2. **GPS EXIF taşıyan gerçek bir JPEG yüklenir ve SUNULAN BAYTLARDA GPS'in
 *      kalmadığı doğrulanır.** Bu süitin asıl sebebi bu: işletmenin telefonuyla
 *      çektiği fotoğraf çekim koordinatını taşır ve o bilgi yayımlanmamalı.
 *   3. Sıkıştırma bombası (küçük dosya, devasa piksel) reddedilir.
 *   4. Adet sınırı tutar.
 *   5. Görsel KENDİ ALAN ADIMIZDAN sunulur, blob adresinden değil.
 *   6. Başka işletmenin aktivitesine yükleme yapılamaz.
 *   7. Personel (staff) görsel yükleyemez — katalog sahibin işi.
 *   8. Silinen görselin dosyası da gider.
 *
 * Kullanım: npm start > server.log & node scripts/verify-uploads.mjs
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { db as connect } from '../lib/db/index.mjs';
import { ensureTestAccounts, loginAs } from './lib/test-accounts.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const OWNER_OPERATOR = 'buyukcekmece-wsc';
const OTHER_OPERATOR = 'mimarsinan-marina';

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const store = await connect();
await ensureTestAccounts();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

// ------------------------------------------------------------- test dosyaları

/**
 * GPS koordinatı ve cihaz bilgisi taşıyan GERÇEK bir JPEG.
 *
 * Koordinat kasten tanınabilir: 41°01'30"N 28°35'12"E. Sunulan baytlarda bu
 * değerlerin ya da "RASTLA-GIZLI-KONUM" dizgisinin bulunmaması gerekiyor.
 */
const SECRET_MARKER = 'RASTLA-GIZLI-KONUM';

const jpegWithGps = await sharp({
  create: { width: 1200, height: 900, channels: 3, background: { r: 20, g: 120, b: 180 } },
})
  .withExif({
    IFD0: { Make: SECRET_MARKER, Model: 'Konumlu Telefon' },
    GPS: {
      GPSLatitudeRef: 'N',
      GPSLatitude: '41/1 1/1 30/1',
      GPSLongitudeRef: 'E',
      GPSLongitude: '28/1 35/1 12/1',
    },
  })
  .jpeg()
  .toBuffer();

// Yüklemeden önce dosyanın GERÇEKTEN konum taşıdığı doğrulanıyor. Bu olmadan
// "GPS silindi" iddiası boş olurdu: hiç konmamış bir veriyi silmiş sayılırdık.
check(
  'test dosyası gerçekten EXIF/GPS taşıyor',
  Boolean((await sharp(jpegWithGps).metadata()).exif) &&
    jpegWithGps.toString('latin1').includes(SECRET_MARKER),
  `${jpegWithGps.length} bayt`
);

/** JPEG gibi görünmeye çalışan ama olmayan dosya. */
const fakeJpeg = Buffer.from(
  '#!/bin/sh\necho "bu bir betik, gorsel degil"\n'.padEnd(4096, ' '),
  'utf8'
);

/**
 * Sıkıştırma bombası: küçük dosya, devasa piksel sayısı.
 *
 * 8000x8000 = 64 megapiksel; uygulamanın 40 megapiksellik sınırının üzerinde.
 * Tek renk olduğu için PNG olarak birkaç yüz kilobayt kalıyor ama açıldığında
 * yüzlerce megabayt bellek ister. Sınır olmasaydı 6 MB'lik dosya sınırından
 * rahatça geçen tek bir istek sunucuyu zorlayabilirdi.
 *
 * `limitInputPixels: false` yalnızca dosyayı ÜRETMEK için; sınanan şey
 * uygulamanın bu dosyayı reddetmesi.
 */
const bomb = await sharp({
  create: { width: 8000, height: 8000, channels: 3, background: { r: 0, g: 0, b: 0 } },
  limitInputPixels: false,
})
  .png({ compressionLevel: 9 })
  .toBuffer();

check('bomba dosyası küçük ama devasa piksel taşıyor', bomb.length < 2_000_000, `${bomb.length} bayt`);

// ------------------------------------------------------------------- yardımcı

// Giriş sonrası varılan ekran role göre değişiyor (sahip artık Bugün'e
// düşüyor); bekleme mantığı tek yerde, scripts/lib/test-accounts.mjs içinde.
const login = (page, operatorId, role = 'owner') => loginAs(page, BASE, operatorId, role);

/**
 * Aktivite düzenleme ekranından dosya yükler ve ekrandaki cevabı döner.
 *
 * `force` verildiğinde arayüzün kendi engelleri (disabled alan ve buton) DOM
 * üzerinden kaldırılır. Sınırın gerçekten SUNUCUDA uygulandığını kanıtlamanın
 * yolu bu: istemcideki her kısıt atlanabilir ve atlandığında ne olduğunu
 * sınamayan bir test, arayüzü test etmiş olur, kuralı değil.
 */
async function upload(page, activityId, { name, mimeType, buffer, alt = '', force = false }) {
  await page.goto(`${BASE}/isletme/aktiviteler/${activityId}`, { waitUntil: 'networkidle' });

  const input = page.locator('input[type="file"]');
  if ((await input.count()) === 0) return { error: 'yükleme alanı yok' };

  if (force) {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('[disabled]')) el.removeAttribute('disabled');
    });
  }

  await input.setInputFiles({ name, mimeType, buffer });
  if (alt) await page.locator('input[name="alt"]').first().fill(alt);

  // Gönder düğmesi, DOSYA ALANINI İÇEREN formdan seçiliyor.
  //
  // Önceki hâli sayfadaki son gönder düğmesini tıklıyordu ve bu, ekranda
  // yükleme bölümünden sonra hiçbir form olmadığı sürece doğru çalışıyordu.
  // Paylaşım linkleri bölümü eklenince "son form" o oldu: test artık link
  // formunu gönderiyor, hiçbir görsel yüklenmiyor, buna rağmen "reddedilen
  // dosya için kayıt oluşmuyor" gibi kontroller GEÇİYORDU — yani süit doğru
  // sonucu yanlış sebeple veriyordu. Konum bağımlı seçici, yeni bir bölüm
  // eklendiğinde sessizce yanlış şeyi test etmeye başlar.
  await input.locator('xpath=ancestor::form[1]').locator('button[type="submit"]').last().click();
  await page.waitForTimeout(3000);

  // Next.js'in KENDİ yönlendirme duyurucusu da `role="alert"` taşıyor
  // (`#__next-route-announcer__`) ve istemci tarafı gezinmeden sonra sayfa
  // başlığını içeriyor. Dışlanmazsa başarılı bir yükleme, "hata" olarak
  // okunuyor ve hatanın metni sayfa başlığı oluyordu — testin BAŞARIYI
  // BAŞARISIZLIK sandığı bir durum. Uygulamanın kendi uyarısı aranıyor.
  const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)').first();
  if ((await alert.count()) > 0) {
    const text = (await alert.innerText()).trim();
    if (text) return { error: text };
  }

  const status = page.locator('[role="status"]').first();
  return { message: (await status.count()) > 0 ? (await status.innerText()).trim() : '' };
}

async function imagesOf(activityId) {
  return store.all('SELECT * FROM activity_images WHERE activity_id = ? ORDER BY position', [
    activityId,
  ]);
}

// Testin kendi aktivitesi: tohum verisini kirletmemek için.
const activity = await store.get('SELECT * FROM activities WHERE operator_id = ? LIMIT 1', [
  OWNER_OPERATOR,
]);
const otherActivity = await store.get('SELECT * FROM activities WHERE operator_id = ? LIMIT 1', [
  OTHER_OPERATOR,
]);

// Önceki koşumlardan kalan görseller temizlenir; adet sınırı testi taze bir
// sayfadan başlamalı.
await store.run('DELETE FROM activity_images WHERE activity_id = ?', [activity.id]);

const ownerPage = await (await browser.newContext()).newPage();
await login(ownerPage, OWNER_OPERATOR, 'owner');

// ---------- 1. Sahte içerik türü reddediliyor ----------

{
  const result = await upload(ownerPage, activity.id, {
    name: 'zararsiz.jpg',
    mimeType: 'image/jpeg', // BEYAN doğru, İÇERİK değil
    buffer: fakeJpeg,
  });

  check(
    'uzantısı ve MIME türü doğru olan SAHTE dosya reddediliyor',
    /JPEG, PNG veya WebP/.test(result.error ?? ''),
    result.error ?? result.message
  );
  check('reddedilen dosya için kayıt oluşmuyor', (await imagesOf(activity.id)).length === 0);
}

// ---------- 3. Sıkıştırma bombası reddediliyor ----------

{
  const result = await upload(ownerPage, activity.id, {
    name: 'bomba.png',
    mimeType: 'image/png',
    buffer: bomb,
  });

  check(
    'sıkıştırma bombası reddediliyor',
    Boolean(result.error),
    result.error ?? 'kabul edildi (!)'
  );
  check('bomba için kayıt oluşmuyor', (await imagesOf(activity.id)).length === 0);
}

// ---------- 2 + 5. GPS'li JPEG yükleniyor, konum siliniyor ----------

{
  const result = await upload(ownerPage, activity.id, {
    name: 'konumlu-fotograf.jpg',
    mimeType: 'image/jpeg',
    buffer: jpegWithGps,
    alt: 'Koyda kürek çeken iki kişi',
  });

  check('geçerli JPEG kabul ediliyor', !result.error, result.error ?? result.message);

  const images = await imagesOf(activity.id);
  check('görsel kaydı oluştu', images.length === 1, `${images.length} kayıt`);

  if (images.length === 1) {
    const image = images[0];

    // Sunucudan SERVİS EDİLEN baytlar okunuyor — depodaki dosya değil.
    // Kullanıcının gerçekten aldığı şey bu.
    const served = await fetch(`${BASE}/gorsel/${image.id}`);
    const bytes = Buffer.from(await served.arrayBuffer());
    const text = bytes.toString('latin1');

    check('görsel sunuluyor', served.status === 200, `HTTP ${served.status}`);
    check(
      'görsel WebP olarak yeniden kodlanmış',
      (served.headers.get('content-type') ?? '').includes('image/webp'),
      served.headers.get('content-type')
    );

    // ASIL İDDİA.
    const meta = await sharp(bytes).metadata();
    check(
      'sunulan baytlarda EXIF YOK',
      !meta.exif,
      meta.exif ? `${meta.exif.length} bayt EXIF kalmış` : 'temiz'
    );
    check(
      'sunulan baytlarda cihaz/konum işareti YOK',
      !text.includes(SECRET_MARKER),
      text.includes(SECRET_MARKER) ? 'işaret hâlâ dosyada!' : 'temiz'
    );
    check(
      'sunulan baytlarda GPS bloğu YOK',
      !text.includes('GPS'),
      text.includes('GPS') ? 'GPS dizgisi bulundu' : 'temiz'
    );

    check(
      'uzun kenar 1600 pikselle sınırlanmış',
      Number(image.width) <= 1600 && Number(image.height) <= 1600,
      `${image.width}x${image.height}`
    );

    check(
      'görsel uzun süreli önbelleğe alınıyor',
      (served.headers.get('cache-control') ?? '').includes('immutable'),
      served.headers.get('cache-control')
    );

    // Aktivite kaydı yüklenen görseli kapak olarak gösteriyor mu.
    const updated = await store.get('SELECT image FROM activities WHERE id = ?', [activity.id]);
    check(
      'aktivitenin kapak görseli KENDİ alan adımızı işaret ediyor',
      updated.image === `/gorsel/${image.id}`,
      updated.image
    );

    // Yerel depoda dosya gerçekten var mı (üretimde blob; testte yerel).
    const path = join(process.cwd(), 'data', 'gorseller', image.storage_key);
    if (existsSync(path)) {
      const onDisk = await readFile(path);
      check(
        'DEPODAKİ dosyada da EXIF yok',
        !(await sharp(onDisk).metadata()).exif,
        'yalnızca sunulan kopya değil, saklanan kopya da temiz'
      );
    }
  }
}

// ---------- 6. Başka işletmenin aktivitesine yüklenemiyor ----------

{
  const before = (await imagesOf(otherActivity.id)).length;
  const page = await (await browser.newContext()).newPage();
  await login(page, OWNER_OPERATOR, 'owner');

  // Adres doğrudan yazılıyor; menüde böyle bir bağlantı yok.
  await page.goto(`${BASE}/isletme/aktiviteler/${otherActivity.id}`, {
    waitUntil: 'networkidle',
  });

  const reachable = (await page.locator('input[type="file"]').count()) > 0;
  check(
    'başka işletmenin aktivite sayfası açılmıyor',
    !reachable,
    reachable ? 'sayfa açıldı (!)' : 'bulunamadı'
  );
  check(
    'başka işletmenin görsel sayısı değişmedi',
    (await imagesOf(otherActivity.id)).length === before
  );
  await page.close();
}

// ---------- 7. Personel yükleyemiyor ----------

{
  const page = await (await browser.newContext()).newPage();
  await login(page, OWNER_OPERATOR, 'staff');
  await page.goto(`${BASE}/isletme/aktiviteler/${activity.id}`, { waitUntil: 'networkidle' });

  check(
    'personel aktivite düzenleme ekranına giremiyor',
    !page.url().includes('/aktiviteler/'),
    page.url()
  );
  await page.close();
}

// ---------- 4. Adet sınırı ----------

{
  // Sınıra kadar doldurulur. Bir tane zaten var, yedi tane daha eklenecek.
  const plain = await sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 200, b: 200 } },
  })
    .jpeg()
    .toBuffer();

  for (let i = 0; i < 7; i++) {
    await upload(ownerPage, activity.id, {
      name: `dolgu-${i}.jpg`,
      mimeType: 'image/jpeg',
      buffer: plain,
      alt: `Dolgu ${i}`,
    });
  }

  const atLimit = await imagesOf(activity.id);
  check('sınıra kadar yükleme yapılabiliyor', atLimit.length === 8, `${atLimit.length} görsel`);

  // Önce arayüz: sınıra gelindiğinde yükleme alanı kapanmalı.
  await ownerPage.goto(`${BASE}/isletme/aktiviteler/${activity.id}`, { waitUntil: 'networkidle' });
  check(
    'sınıra gelindiğinde arayüz yüklemeyi kapatıyor',
    await ownerPage.locator('input[type="file"][disabled]').count().then((n) => n === 1),
    'buton "Sınıra ulaşıldı" gösteriyor'
  );

  // Sonra asıl kanıt: arayüzün engeli kaldırılıp istek yine de gönderiliyor.
  const overflow = await upload(ownerPage, activity.id, {
    name: 'dokuzuncu.jpg',
    mimeType: 'image/jpeg',
    buffer: plain,
    force: true,
  });

  check(
    'arayüz atlansa bile dokuzuncu görseli SUNUCU reddediyor',
    /en fazla 8/.test(overflow.error ?? ''),
    overflow.error ?? overflow.message ?? 'hata mesajı yok'
  );
  check(
    'sınır aşılmadı',
    (await imagesOf(activity.id)).length === 8,
    `${(await imagesOf(activity.id)).length} görsel`
  );
}

// ---------- 8. Silme hem kaydı hem dosyayı kaldırıyor ----------

{
  const images = await imagesOf(activity.id);
  const target = images[images.length - 1];
  const path = join(process.cwd(), 'data', 'gorseller', target.storage_key);
  const existedBefore = existsSync(path);

  await ownerPage.goto(`${BASE}/isletme/aktiviteler/${activity.id}`, { waitUntil: 'networkidle' });
  await ownerPage.getByRole('button', { name: /^Sil$/ }).last().click();
  await ownerPage.waitForTimeout(2500);

  const remaining = await imagesOf(activity.id);
  check(
    'silinen görselin kaydı gitti',
    remaining.length === images.length - 1,
    `${images.length} -> ${remaining.length}`
  );

  if (existedBefore) {
    check('silinen görselin DOSYASI da gitti', !existsSync(path), 'depoda sahipsiz dosya kalmıyor');
  }

  const gone = await fetch(`${BASE}/gorsel/${target.id}`);
  check('silinen görsel artık sunulmuyor', gone.status === 404, `HTTP ${gone.status}`);
}

// ---------- Günlük ----------

{
  const logged = await store.all(
    `SELECT * FROM audit_log WHERE action IN ('activity.image_uploaded', 'activity.image_deleted')
      AND target_id = ?`,
    [activity.id]
  );
  check('yükleme ve silme günlüğe düşüyor', logged.length >= 2, `${logged.length} kayıt`);

  // Dosya adı kullanıcı girdisidir ve bazen kişisel bilgi taşır
  // ("ahmet-dugun-2024.jpg"); günlüğe kopyalanmamalı.
  const meta = logged.map((r) => String(r.meta ?? '')).join(' ');
  check(
    'dosya adı günlüğe YAZILMIYOR',
    !meta.includes('konumlu-fotograf') && !meta.includes('.jpg'),
    'kişisel veri ikinci bir yerde çoğaltılmıyor'
  );
}

// ------------------------------------------------------------------- rapor

await browser.close();

console.log('\nGÖRSEL YÜKLEME DOĞRULAMASI\n');
for (const { name, pass, detail } of checks) {
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti.\n`);

await store.close();
process.exit(failed === 0 ? 0 : 1);
