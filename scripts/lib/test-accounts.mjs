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

export const TEST_ACCOUNTS = [
  { operatorId: 'buyukcekmece-wsc', email: 'test-sahip@buyukcekmece.local', role: 'owner' },
  { operatorId: 'mimarsinan-marina', email: 'test-sahip@mimarsinan.local', role: 'owner' },
  { operatorId: 'buyukcekmece-wsc', email: 'test-personel@buyukcekmece.local', role: 'staff' },
];

export function emailFor(operatorId, role = 'owner') {
  const found = TEST_ACCOUNTS.find((a) => a.operatorId === operatorId && a.role === role);
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
         (id, operator_id, email, name, password_hash, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = excluded.password_hash,
         status = 'active',
         role = excluded.role`,
      [
        randomUUID(),
        account.operatorId,
        account.email,
        `Test ${account.role === 'owner' ? 'Sahibi' : 'Personeli'}`,
        hashPassword(TEST_PASSWORD),
        account.role,
        now,
      ]
    );
  }
}

/** Giriş formunu gerçek yoldan doldurur — oturum çerezi elle üretilmez. */
export async function loginAs(page, baseUrl, operatorId, role = 'owner') {
  await page.goto(`${baseUrl}/isletme`, { waitUntil: 'networkidle' });
  await page.fill('#email', emailFor(operatorId, role));
  await page.fill('#password', TEST_PASSWORD);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await page.waitForURL(/\/isletme\/tara/, { timeout: 15000 });
}
