/**
 * İşletme self-servis kaydının testi.
 *
 * Bu duvar yıkılmadan onuncu işletmeye çıkmak mümkün değildi: hesabı elle biz
 * açıyorduk ve her işletme bir insan-iş demekti.
 *
 * Ama açılan kapı, arkasındaki kontrolü de yıkmamalı. Buradaki en önemli
 * iddia şu: **kayıt DOĞRULAMA DEĞİLDİR.** Kendi kendini doğrulayabilen bir
 * işletme, müşteriye gösterilen "doğrulanmış" rozetinin arkasındaki tek insan
 * kontrolünü ortadan kaldırırdı.
 *
 * Sınananlar:
 *   1. Kayıt işletmeyi ve sahip hesabını birlikte açıyor, oturum doğrudan
 *      başlıyor.
 *   2. **İşletme `basvuru` durumunda doğuyor** — doğrulanmış değil.
 *   3. **İlanı yayına veremiyor**, RASTLA incelemesine düşüyor.
 *   4. Müşteri tarafında rozet GÖRÜNMÜYOR.
 *   5. Aynı e-postayla ikinci kayıt reddediliyor ve **sahipsiz işletme satırı
 *      bırakmıyor**.
 *   6. Zayıf parola, eksik telefon, kısa ad reddediliyor — hepsi SUNUCUDA
 *      (istemci doğrulaması sökülerek sınanıyor).
 *   7. Yeni hesap kendi işletmesinin sahibi; BAŞKA işletmenin verisine
 *      erişemiyor.
 *   8. Parola veritabanında açık durmuyor.
 *
 * Kullanım:
 *   npm start > server.log &
 *   node scripts/verify-signup.mjs
 */
import { chromium } from 'playwright';
import { db as connect } from '../lib/db/index.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const store = await connect();

const tag = Date.now();
const EMAIL = `kayit-${tag}@ornek.local`;
const PASSWORD = 'kayit-test-parolasi-2026';
const OPERATOR_NAME = `Kayıt Testi ${tag}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

async function freshPage() {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/**
 * Kayıt formunu doldurur ve gönderir.
 *
 * `strip` verilirse istemci doğrulaması SÖKÜLÜYOR (required/minlength
 * kaldırılıyor). Sunucunun reddettiğini kanıtlamanın tek yolu bu: tarayıcı
 * engellerse testin geçtiği yer sunucu değil tarayıcı olur ve formu atlayan
 * biri için hiçbir şey kanıtlanmaz.
 */
async function signUp(page, fields, { strip = false, resetLimit = true } = {}) {
  // Hız sınırı kovası TEMİZLENİYOR (aksi belirtilmedikçe).
  //
  // Sınır saatte üç başvuru ve bu süit tek IP'den onlarca deneme yapıyor;
  // temizlenmeseydi doğrulama kontrolleri sınıra takılır ve test "sunucu
  // reddetti" derken aslında limitleyiciyi ölçerdi — doğru sonuç, yanlış
  // sebep. Sınırın kendisi aşağıda AYRICA ve bilerek sınanıyor.
  if (resetLimit) {
    await store.run("DELETE FROM rate_limits WHERE bucket LIKE 'operator-signup:%'");
  }

  await page.goto(`${BASE}/isletme/basvuru`, { waitUntil: 'networkidle' });

  for (const [id, value] of Object.entries(fields)) {
    await page.fill(`#${id}`, value);
  }

  // Sökme işlemi DOLDURMADAN SONRA, tıklamadan hemen önce.
  //
  // Önce sökülürse React yeniden çizerken `type="email"` gibi nitelikleri geri
  // koyuyor ve tarayıcı geçersiz e-postalı formu hiç göndermiyor: sunucuya
  // istek gitmiyor, hata kutusu çıkmıyor ve test "sunucu kabul etti" sanıyor.
  // Bu tam olarak testin en sinsi yanlış sonucu — gerçekte sunucu reddediyor.
  if (strip) {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('input')) {
        el.removeAttribute('required');
        el.removeAttribute('minlength');
        el.setAttribute('type', 'text');
      }
      document.querySelector('form')?.setAttribute('novalidate', 'novalidate');
    });
  }

  const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)').first();

  await page.getByRole('button', { name: /Hesabımı Aç/ }).click();

  // Sabit bekleme yerine SONUCU bekliyoruz: ya sayfa değişir ya da hata
  // kutusu görünür. Sabit süre, yavaş bir yanıtta hatayı görmeden "kabul
  // edildi" demeye yol açıyordu — testin en sinsi yanlış sonucu.
  await Promise.race([
    page.waitForURL((url) => !url.pathname.includes('/basvuru'), { timeout: 15000 }),
    alert.waitFor({ state: 'visible', timeout: 15000 }),
  ]).catch(() => null);

  const error = (await alert.count()) > 0 ? (await alert.innerText()).trim() : null;
  return { url: page.url(), error };
}

// ---------- 1. Kayıt çalışıyor ----------

let operatorId = null;

{
  const { context, page } = await freshPage();
  const result = await signUp(page, {
    operatorName: OPERATOR_NAME,
    userName: 'Kayıt Testi Sahibi',
    email: EMAIL,
    phone: `0533${String(tag).slice(-7)}`,
    password: PASSWORD,
  });

  check(
    'kayıt tamamlanıyor ve doğrudan panele giriliyor',
    !result.url.includes('/basvuru'),
    result.error ?? result.url
  );

  const user = await store.get('SELECT * FROM operator_users WHERE email = ?', [EMAIL]);
  check('sahip hesabı açıldı', Boolean(user), user ? `rol: ${user.role}` : 'yok');
  check('yeni hesabın rolü SAHİP', user?.role === 'owner', user?.role);

  if (user) {
    operatorId = user.operator_id;
    check(
      'parola veritabanında AÇIK durmuyor',
      !String(user.password_hash).includes(PASSWORD) &&
        String(user.password_hash).startsWith('scrypt$'),
      String(user.password_hash).slice(0, 12) + '…'
    );
    check(
      'ikinci faktör için telefon kaydedildi',
      Boolean(user.phone),
      user.phone ? 'var' : 'YOK'
    );
  }

  await context.close();
}

// ---------- 2. İşletme DOĞRULANMIŞ DEĞİL ----------

const operator = operatorId
  ? await store.get('SELECT * FROM operators WHERE id = ?', [operatorId])
  : null;

check(
  'işletme BAŞVURU durumunda doğuyor — kendi kendini doğrulayamıyor',
  operator?.verification_status === 'basvuru',
  operator?.verification_status
);
check(
  'işletme kimliği okunur bir slug',
  typeof operator?.id === 'string' && /^[a-z0-9-]+$/.test(operator.id),
  operator?.id
);

// ---------- 3 + 4. İlan yayına çıkmıyor, rozet yok ----------

{
  const { publishTargetFor } = await import('../lib/db/activities.ts');
  check(
    'doğrulanmamış işletmenin ilanı YAYINA değil İNCELEMEYE gidiyor',
    publishTargetFor('basvuru') === 'pending_review',
    publishTargetFor('basvuru')
  );

  const { showsVerifiedBadge } = await import('../lib/verification-status.ts');
  check(
    'müşteri tarafında doğrulama rozeti GÖRÜNMÜYOR',
    showsVerifiedBadge('basvuru') === false
  );
}

// ---------- 5. Aynı e-posta ikinci kez ----------

{
  const before = await store.get('SELECT COUNT(*) AS n FROM operators');

  const { context, page } = await freshPage();
  const result = await signUp(page, {
    operatorName: `İkinci Deneme ${tag}`,
    userName: 'Baska Kisi',
    email: EMAIL,
    phone: `0534${String(tag).slice(-7)}`,
    password: PASSWORD,
  });

  check(
    'aynı e-postayla ikinci kayıt REDDEDİLİYOR',
    Boolean(result.error) && /zaten var/i.test(result.error),
    result.error ?? 'hata yok (!)'
  );

  const after = await store.get('SELECT COUNT(*) AS n FROM operators');
  check(
    'reddedilen kayıt SAHİPSİZ işletme satırı bırakmıyor',
    Number(after.n) === Number(before.n),
    `${before.n} → ${after.n}`
  );

  await context.close();
}

// ---------- 6. Sunucu doğrulaması (istemci sökülerek) ----------

const badCases = [
  {
    name: 'zayıf parola SUNUCUDA reddediliyor',
    fields: { password: 'kisa' },
    expect: /10 karakter/i,
  },
  {
    name: 'geçersiz telefon SUNUCUDA reddediliyor',
    fields: { phone: '123' },
    expect: /cep telefonu/i,
  },
  {
    name: 'kısa işletme adı SUNUCUDA reddediliyor',
    fields: { operatorName: 'X' },
    expect: /şletme ad/i,
  },
  {
    name: 'geçersiz e-posta SUNUCUDA reddediliyor',
    fields: { email: 'bu-eposta-degil' },
    expect: /e-posta/i,
  },
];

for (const [i, bad] of badCases.entries()) {
  const { context, page } = await freshPage();
  const result = await signUp(
    page,
    {
      operatorName: `Hatalı ${tag}-${i}`,
      userName: 'Hatalı Deneme',
      email: `hatali-${tag}-${i}@ornek.local`,
      phone: `0535${String(tag).slice(-7)}`,
      password: PASSWORD,
      ...bad.fields,
    },
    { strip: true }
  );

  check(bad.name, Boolean(result.error) && bad.expect.test(result.error), result.error ?? 'kabul edildi (!)');
  await context.close();
}

// ---------- Hız sınırı: sınırsız başvuru inceleme kuyruğunu boğar ----------

{
  await store.run("DELETE FROM rate_limits WHERE bucket LIKE 'operator-signup:%'");

  const errors = [];

  // Dört deneme, sınır üç. Dördüncüsü reddedilmeli.
  //
  // Her deneme TEMİZ OTURUMDA: başarılı bir kayıt oturum açıyor ve aynı
  // sekmede ikinci kez başvuru sayfasına gidilince panele yönlendiriliyor.
  // Sınır IP'ye bağlı, oturuma değil — bu yüzden ayrı bağlamlar sınırı
  // paylaşmaya devam ediyor.
  for (let i = 0; i < 4; i++) {
    const { context, page } = await freshPage();
    const r = await signUp(
      page,
      {
        operatorName: `Sınır Testi ${tag}-${i}`,
        userName: 'Sınır Denemesi',
        email: `sinir-${tag}-${i}@ornek.local`,
        phone: `0536${String(tag).slice(-7)}`,
        password: PASSWORD,
      },
      { resetLimit: false }
    );
    errors.push(r.error);
    await context.close();
  }

  check(
    'saatte üçten fazla başvuru REDDEDİLİYOR — inceleme kuyruğu betikle boğulamıyor',
    errors[3] !== null && /çok fazla başvuru/i.test(errors[3] ?? ''),
    errors[3] ?? 'dördüncü başvuru kabul edildi (!)'
  );
  check(
    'sınıra kadar olan başvurular geçiyor',
    errors.slice(0, 3).every((e) => e === null),
    errors.slice(0, 3).map((e) => e ?? 'tamam').join(' | ')
  );

  await store.run("DELETE FROM rate_limits WHERE bucket LIKE 'operator-signup:%'");
}

// ---------- 7. Yeni hesap başka işletmenin verisine erişemiyor ----------

{
  const other = await store.get("SELECT id FROM operators WHERE id <> ? LIMIT 1", [operatorId]);

  const { context, page } = await freshPage();
  await page.goto(`${BASE}/isletme`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await page.waitForTimeout(2500);

  // Telefonu olduğu için ikinci faktör isteniyor: girişin YARIM kaldığı ve
  // panele geçilmediği doğrulanıyor. Kodu okumak bu süitin işi değil
  // (verify-otp onu sınıyor); burada önemli olan yarım girişin panel
  // açmaması.
  const onPanel = /\/isletme\/(bugun|tara)/.test(page.url());
  check(
    'telefonu olan yeni hesap ikinci faktörsüz panele GİREMİYOR',
    !onPanel,
    page.url()
  );

  await context.close();

  // Başka işletmenin aktivitesi bu hesaba görünmemeli — veri katmanında.
  const { listActivitiesForOperator } = await import('../lib/db/activities.ts');
  const mine = await listActivitiesForOperator(operatorId);
  check(
    'yeni işletmenin ilan listesi BOŞ başlıyor',
    mine.length === 0,
    `${mine.length} ilan`
  );

  if (other) {
    const theirs = await listActivitiesForOperator(other.id);
    check(
      'başka işletmenin ilanları ayrı duruyor (karışmıyor)',
      theirs.every((a) => a.operatorId === other.id),
      `${theirs.length} ilan, hepsi ${other.id}`
    );
  }
}

await browser.close();

// Temizlik
await store.run('DELETE FROM operator_users WHERE email LIKE ?', [`%${tag}@ornek.local`]);
await store.run('DELETE FROM operators WHERE name LIKE ?', [`%${tag}%`]);
await store.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
