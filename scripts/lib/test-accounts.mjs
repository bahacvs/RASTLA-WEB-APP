/**
 * Tarayıcı testleri için bilinen parolalı işletme hesapları.
 *
 * Seed'in ürettiği parolalar rastgeledir ve bilinçli olarak yalnızca bir kez
 * yazdırılır; testler onları kullanamaz. Bunun yerine test kendi hesabını
 * doğrudan veritabanına yazar — uygulamanın kullandığı ile AYNI özetleme
 * fonksiyonuyla. Böylece test, gerçek giriş yolundan geçer; parola
 * doğrulaması atlanmaz.
 */
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../lib/password.mjs';
import { db as connect } from '../../lib/db/index.mjs';

export const TEST_PASSWORD = 'test-parolasi-2026';

/**
 * Telefonlu ve telefonsuz hesaplar bilinçli olarak karışık.
 *
 * Telefonu olanlar ikinci faktörden geçer; olmayanlar (bu özellikten önce
 * açılmış hesapları temsil eder) parolayla girer. İkisi de sınanmalı: yalnızca
 * biri test edilseydi diğer yol sessizce bozulabilirdi.
 */
export const TEST_ACCOUNTS = [
  {
    operatorId: 'buyukcekmece-wsc',
    email: 'test-sahip@buyukcekmece.local',
    role: 'owner',
    phone: null,
  },
  { operatorId: 'mimarsinan-marina', email: 'test-sahip@mimarsinan.local', role: 'owner', phone: null },
  {
    operatorId: 'buyukcekmece-wsc',
    email: 'test-personel@buyukcekmece.local',
    role: 'staff',
    phone: null,
  },
  // Yönetici: operasyonu yürütür ama finansa giremez. Üç rolün de sınanması
  // gerekiyor; yalnızca uçlar (sahip ve saha personeli) test edilseydi
  // aradaki rolün yanlış tarafa düşmesi görülmezdi.
  {
    operatorId: 'buyukcekmece-wsc',
    email: 'test-yonetici@buyukcekmece.local',
    role: 'manager',
    phone: null,
  },
  // İkinci faktörü olan hesap.
  {
    operatorId: 'buyukcekmece-wsc',
    email: 'test-2fa@buyukcekmece.local',
    role: 'owner',
    phone: '905339990001',
  },
];

export function phoneFor(email) {
  return TEST_ACCOUNTS.find((a) => a.email === email)?.phone ?? null;
}

export function emailFor(operatorId, role = 'owner') {
  const found = TEST_ACCOUNTS.find(
    (a) => a.operatorId === operatorId && a.role === role && !a.phone
  );
  if (!found) throw new Error(`test hesabı tanımlı değil: ${operatorId}/${role}`);
  return found.email;
}

/**
 * Test hesaplarını oluşturur ya da parolalarını bilinen değere döndürür.
 *
 * Uygulamanın bağlantı katmanını kullanır: DATABASE_URL tanımlıysa testler de
 * Postgres'e karşı çalışır.
 */
export async function ensureTestAccounts() {
  const db = await connect();
  const now = new Date().toISOString();

  for (const account of TEST_ACCOUNTS) {
    await db.run(
      `INSERT INTO operator_users
         (id, operator_id, email, name, password_hash, role, status, created_at, phone)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = excluded.password_hash,
         status = 'active',
         role = excluded.role,
         phone = excluded.phone`,
      [
        randomUUID(),
        account.operatorId,
        account.email,
        `Test ${{ owner: 'Sahibi', manager: 'Yöneticisi', staff: 'Personeli' }[account.role]}`,
        hashPassword(TEST_PASSWORD),
        account.role,
        now,
        account.phone,
      ]
    );
  }
}

/**
 * RASTLA operasyon ekibi test hesapları.
 *
 * İki rol de gerekiyor: `reviewer` işletme doğrular ama komisyona ve hak
 * edişe dokunamaz. Yalnızca `admin` sınansaydı, inceleme rolünün yanlış
 * tarafa düşmesi — yani her gün ilan bakan birinin sözleşme değiştirebilmesi —
 * görülmezdi.
 */
export const PLATFORM_ACCOUNTS = [
  { email: 'test-admin@rastla.local', name: 'Test Yönetici', role: 'admin' },
  { email: 'test-inceleme@rastla.local', name: 'Test İnceleme', role: 'reviewer' },
];

export function platformEmailFor(role = 'admin') {
  const found = PLATFORM_ACCOUNTS.find((a) => a.role === role);
  if (!found) throw new Error(`platform test hesabı tanımlı değil: ${role}`);
  return found.email;
}

export async function ensurePlatformAccounts() {
  const db = await connect();
  const now = new Date().toISOString();

  for (const account of PLATFORM_ACCOUNTS) {
    await db.run(
      `INSERT INTO platform_users (id, email, name, password_hash, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = excluded.password_hash,
         status = 'active',
         role = excluded.role`,
      [randomUUID(), account.email, account.name, hashPassword(TEST_PASSWORD), account.role, now]
    );
  }
}

/** Yönetim paneline gerçek giriş formundan girer. */
export async function loginAsPlatform(page, baseUrl, role = 'admin') {
  await page.goto(`${baseUrl}/yonetim`, { waitUntil: 'networkidle' });
  await page.fill('#email', platformEmailFor(role));
  await page.fill('#password', TEST_PASSWORD);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await page.waitForURL(/\/yonetim\/isletmeler/, { timeout: 15000 });
}

/** Giriş formunu gerçek yoldan doldurur — oturum çerezi elle üretilmez. */
export async function loginAs(page, baseUrl, operatorId, role = 'owner') {
  await page.goto(`${baseUrl}/isletme`, { waitUntil: 'networkidle' });
  await page.fill('#email', emailFor(operatorId, role));
  await page.fill('#password', TEST_PASSWORD);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  // Giriş sonrası varsayılan ekran role göre değişiyor: Bugün'ü görebilen
  // oraya, göremeyen bilet okutma ekranına düşüyor.
  await page.waitForURL(/\/isletme\/(bugun|tara)/, { timeout: 15000 });
}
