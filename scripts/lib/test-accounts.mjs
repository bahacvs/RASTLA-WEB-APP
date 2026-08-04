/**
 * Tarayıcı testleri için bilinen parolalı işletme hesapları.
 *
 * Seed'in ürettiği parolalar rastgeledir ve bilinçli olarak yalnızca bir kez
 * yazdırılır; testler onları kullanamaz. Bunun yerine test kendi hesabını
 * doğrudan veritabanına yazar — uygulamanın kullandığı ile AYNI özetleme
 * fonksiyonuyla. Böylece test, gerçek giriş yolundan geçer; parola
 * doğrulaması atlanmaz.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { hashPassword } from '../../lib/password.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

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

/** Test hesaplarını oluşturur ya da parolalarını bilinen değere döndürür. */
export function ensureTestAccounts() {
  const path = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'rastla.db');
  mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.exec(readFileSync(join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8'));

  const now = new Date().toISOString();

  for (const account of TEST_ACCOUNTS) {
    const hash = hashPassword(TEST_PASSWORD);

    db.prepare(
      `INSERT INTO operator_users
         (id, operator_id, email, name, password_hash, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = excluded.password_hash,
         status = 'active',
         role = excluded.role`
    ).run(
      randomUUID(),
      account.operatorId,
      account.email,
      `Test ${account.role === 'owner' ? 'Sahibi' : 'Personeli'}`,
      hash,
      account.role,
      now
    );
  }

  db.close();
}

/** Giriş formunu gerçek yoldan doldurur — oturum çerezi elle üretilmez. */
export async function loginAs(page, baseUrl, operatorId, role = 'owner') {
  await page.goto(`${baseUrl}/isletme`, { waitUntil: 'networkidle' });
  await page.fill('#email', emailFor(operatorId, role));
  await page.fill('#password', TEST_PASSWORD);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await page.waitForURL(/\/isletme\/tara/, { timeout: 15000 });
}
