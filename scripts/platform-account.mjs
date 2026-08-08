/**
 * RASTLA operasyon hesabı yönetimi — sunucu tarafı kurtarma aracı.
 *
 * Yönetim paneline giriş yapabilecek ilk hesap uygulamadan açılamaz (tavuk-
 * yumurta): bu betik onun içindir. Sonrası panelden yapılır.
 *
 * Kullanım:
 *   node scripts/platform-account.mjs list
 *   node scripts/platform-account.mjs add <e-posta> "<Ad Soyad>" [admin|reviewer]
 *   node scripts/platform-account.mjs reset <e-posta>
 *   node scripts/platform-account.mjs status <e-posta> <active|suspended>
 *
 * Üretilen parolalar YALNIZCA burada yazdırılır; veritabanında özet saklanır.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { generatePassword, hashPassword } from '../lib/password.mjs';
import { db as connect } from '../lib/db/index.mjs';

const db = await connect();

const USAGE = readFileSync(new URL(import.meta.url), 'utf8')
  .split('\n')
  .slice(1, 13)
  .map((l) => l.replace(/^ \* ?/, '').replace(/^ \*\/?$/, ''))
  .join('\n');

function die(message) {
  console.error(`Hata: ${message}\n`);
  console.error(USAGE);
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'list': {
    const users = await db.all('SELECT * FROM platform_users ORDER BY role, name');
    if (users.length === 0) {
      console.log('Hiç platform hesabı yok. Önce: add <e-posta> "<Ad Soyad>" admin');
      break;
    }
    for (const u of users) {
      console.log(
        `  ${u.email}  ${u.name}  [${u.role}]  ${u.status}` +
          (u.last_login_at ? `  son giriş: ${u.last_login_at}` : '  hiç girmedi')
      );
    }
    break;
  }

  case 'add': {
    const [email, name, role = 'admin'] = args;
    if (!email || !name) die('e-posta ve ad soyad gerekli.');
    if (role !== 'admin' && role !== 'reviewer') die("rol 'admin' ya da 'reviewer' olmalı.");

    const password = generatePassword();
    try {
      await db.run(
        `INSERT INTO platform_users (id, email, name, password_hash, role, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        [
          randomUUID(),
          email.trim().toLowerCase(),
          name,
          hashPassword(password),
          role,
          new Date().toISOString(),
        ]
      );
    } catch (error) {
      if (/UNIQUE|duplicate key/i.test(String(error))) die('bu e-posta zaten kayıtlı.');
      throw error;
    }

    console.log(`\nPlatform hesabı açıldı: ${email} [${role}]`);
    console.log(`Parola: ${password}`);
    console.log('\nBu parola bir daha gösterilmeyecek. Giriş: /yonetim\n');
    break;
  }

  case 'reset': {
    const [email] = args;
    if (!email) die('e-posta gerekli.');

    const password = generatePassword();
    const result = await db.run('UPDATE platform_users SET password_hash = ? WHERE email = ?', [
      hashPassword(password),
      email.trim().toLowerCase(),
    ]);
    if (result.changes !== 1) die('hesap bulunamadı.');

    console.log(`\n${email} parolası sıfırlandı.`);
    console.log(`Yeni parola: ${password}\n`);
    break;
  }

  case 'status': {
    const [email, status] = args;
    if (!email || (status !== 'active' && status !== 'suspended')) {
      die("kullanım: status <e-posta> <active|suspended>");
    }

    const result = await db.run('UPDATE platform_users SET status = ? WHERE email = ?', [
      status,
      email.trim().toLowerCase(),
    ]);
    if (result.changes !== 1) die('hesap bulunamadı.');

    // Askıya alma ANINDA etkili: yetki her istekte veritabanından türetiliyor,
    // çerezden değil. Elindeki çerezle panele giremez.
    console.log(`${email} -> ${status}`);
    break;
  }

  default:
    die('bilinmeyen komut.');
}

await db.close();
