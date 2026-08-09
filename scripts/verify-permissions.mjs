/**
 * Rol ve yetki testi.
 *
 * Üç rol var ve aralarındaki fark menüde değil **sunucuda** olmalı. Bu süitin
 * varlık sebebi tam olarak bu: bir bağlantıyı menüden gizlemek yetkilendirme
 * değildir, adresi elle yazan kişiyi durdurmaz. Bu yüzden her sayfa doğrudan
 * adresle açılıyor ve kişinin gerçekten girip giremediğine bakılıyor.
 *
 * Üç rolün de sınanması gerekiyor. Yalnızca uçlar (sahip ve saha personeli)
 * test edilseydi, aradaki yöneticinin yanlış tarafa düşmesi görülmezdi — ki
 * bu roller eklenirken en olası hata odur.
 *
 * Ayrıca menünün yetki tablosuyla tutarlı olduğu doğrulanıyor: menü daha
 * fazlasını gösterirse kullanıcı kapalı kapıya çarpar, daha azını gösterirse
 * hakkı olan ekranı bulamaz.
 *
 * Kullanım: npm start & node scripts/verify-permissions.mjs
 */
import { chromium } from 'playwright';
import { ensureTestAccounts, loginAs } from './lib/test-accounts.mjs';
import { db } from '../lib/db/index.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const OPERATOR = 'buyukcekmece-wsc';

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

/**
 * Sayfa → hangi roller girebilir.
 *
 * Yönetici finansa ve ekibe giremez: rezervasyonu oluşturan ile parayı
 * yönlendiren aynı kişi olmasın diye (görev ayrılığı).
 */
const MATRIX = [
  { path: '/isletme/bugun', allowed: ['owner', 'manager', 'staff'] },
  { path: '/isletme/tara', allowed: ['owner', 'manager', 'staff'] },
  { path: '/isletme/rezervasyonlar', allowed: ['owner', 'manager', 'staff'] },
  { path: '/isletme/aktiviteler', allowed: ['owner', 'manager'] },
  { path: '/isletme/aktiviteler/yeni', allowed: ['owner', 'manager'] },
  { path: '/isletme/gunluk', allowed: ['owner', 'manager'] },
  { path: '/isletme/finans', allowed: ['owner'] },
  { path: '/isletme/odeme-ayarlari', allowed: ['owner'] },
  { path: '/isletme/ekip', allowed: ['owner'] },
];

/**
 * Menüde görünmesi beklenen bağlantılar — SIRASIYLA.
 *
 * Liste bilerek elle yazılıyor, `lib/permissions.ts` üzerinden türetilmiyor:
 * türetilseydi test menüyü kendi kaynağıyla karşılaştırır ve yanlış bir yetki
 * eşlemesi ikisinde birden aynı şekilde yanlış olurdu. Yeni bir ekran
 * eklendiğinde bu listenin de güncellenmesi GEREKİYOR; bu bir zahmet değil,
 * testin işe yaramasının sebebi.
 */
const MENU = {
  owner: [
    'Bugün',
    'Bilet Okut',
    'Rezervasyonlar',
    'Aktiviteler',
    'Şubeler',
    'Hak Ediş',
    'Ödeme',
    'Ekip',
    'İşlem Günlüğü',
  ],
  // Yönetici şube tanımlayabiliyor: şube bir operasyon kavramı (hangi
  // iskelede çalışıyoruz), ticari bir karar değil. Sahibe özel tutmak, iki
  // lokasyonlu bir işletmede yöneticinin gününü sahibi aramadan
  // düzenleyememesi demekti.
  manager: ['Bugün', 'Bilet Okut', 'Rezervasyonlar', 'Aktiviteler', 'Şubeler', 'İşlem Günlüğü'],
  staff: ['Bugün', 'Bilet Okut', 'Rezervasyonlar'],
};

await ensureTestAccounts();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

for (const role of ['owner', 'manager', 'staff']) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await context.newPage();
  await loginAs(page, BASE, OPERATOR, role);

  for (const { path, allowed } of MATRIX) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    const landed = new URL(page.url()).pathname;
    const stayed = landed === path;
    const mayEnter = allowed.includes(role);

    check(
      `${role}: ${path} ${mayEnter ? 'AÇIK' : 'KAPALI'}`,
      stayed === mayEnter,
      mayEnter ? `kaldı: ${landed}` : `yönlendirildi: ${landed}`
    );
  }

  // Menü, yetki tablosuyla birebir aynı olmalı.
  const shown = await page.locator('header nav a').allInnerTexts();
  const expected = MENU[role];
  check(
    `${role}: menü yetkiyle tutarlı`,
    shown.length === expected.length && expected.every((l) => shown.includes(l)),
    `görünen: ${shown.join(', ') || '(yok)'}`
  );

  await context.close();
}

// Rol etiketi kişinin kendi rolünü doğru gösteriyor mu — yanlış etiket,
// yetkisini yanlış sanan bir kullanıcı üretir.
const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await context.newPage();
await loginAs(page, BASE, OPERATOR, 'manager');
const header = await page.locator('header').innerText();
check('yönetici kendi rolünü doğru görüyor', header.includes('Yönetici'), header.split('\n')[1] ?? '');
await context.close();

await browser.close();

// Veritabanı kısıtı gerçekten üç rolü kabul ediyor mu? Şema kısıtı
// güncellenmemiş bir kurulumda 'manager' INSERT'i patlar ve bu, ilk yönetici
// hesabı açılana kadar fark edilmezdi.
const client = await db();
const roles = await client.all(
  `SELECT DISTINCT role FROM operator_users WHERE operator_id = ? ORDER BY role`,
  [OPERATOR]
);
check(
  'veritabanı üç rolü de saklıyor',
  ['manager', 'owner', 'staff'].every((r) => roles.some((row) => row.role === r)),
  roles.map((r) => r.role).join(', ')
);
await client.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
