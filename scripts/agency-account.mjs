/**
 * Acente ve acente hesabı yönetimi — sunucu tarafı kurtarma aracı.
 *
 * İlk acente hesabı uygulamadan açılamaz (tavuk-yumurta): bu betik onun
 * içindir. Sonrası /yonetim/acenteler ekranından yapılır.
 *
 * Kullanım:
 *   node scripts/agency-account.mjs list
 *   node scripts/agency-account.mjs add-agency "<Acente Adı>" [e-posta] [telefon]
 *   node scripts/agency-account.mjs add <acente-kimliği> <e-posta> "<Ad Soyad>"
 *   node scripts/agency-account.mjs reset <e-posta>
 *   node scripts/agency-account.mjs status <e-posta> <active|suspended>
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
  .slice(1, 14)
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
    const agencies = await db.all('SELECT * FROM agencies ORDER BY name');
    if (agencies.length === 0) {
      console.log('Hiç acente yok. Önce: add-agency "<Acente Adı>"');
      break;
    }

    for (const agency of agencies) {
      console.log(`\n${agency.name}  [${agency.id}]  ${agency.status}`);
      const users = await db.all(
        'SELECT * FROM agency_users WHERE agency_id = ? ORDER BY name',
        [agency.id]
      );
      if (users.length === 0) {
        console.log('  (hesap yok)');
        continue;
      }
      for (const u of users) {
        console.log(
          `  ${u.email}  ${u.name}  ${u.status}` +
            (u.last_login_at ? `  son giriş: ${u.last_login_at}` : '  hiç girmedi')
        );
      }
    }
    console.log('');
    break;
  }

  case 'add-agency': {
    const [name, email, phone] = args;
    if (!name) die('acente adı gerekli.');

    const id = randomUUID();
    await db.run(
      `INSERT INTO agencies (id, name, contact_email, phone, status, created_at)
       VALUES (?, ?, ?, ?, 'active', ?)`,
      [id, name, email ?? null, phone ?? null, new Date().toISOString()]
    );

    console.log(`\nAcente açıldı: ${name}`);
    console.log(`Kimlik: ${id}`);
    console.log(`\nHesap açmak için: node scripts/agency-account.mjs add ${id} <e-posta> "<Ad>"\n`);
    break;
  }

  case 'add': {
    const [agencyId, email, name] = args;
    if (!agencyId || !email || !name) die('acente kimliği, e-posta ve ad soyad gerekli.');

    const agency = await db.get('SELECT id, name FROM agencies WHERE id = ?', [agencyId]);
    if (!agency) die('acente bulunamadı. Önce: add-agency "<Acente Adı>"');

    const password = generatePassword();
    try {
      await db.run(
        `INSERT INTO agency_users (id, agency_id, email, name, password_hash, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        [
          randomUUID(),
          agencyId,
          email.trim().toLowerCase(),
          name,
          hashPassword(password),
          new Date().toISOString(),
        ]
      );
    } catch (error) {
      if (/UNIQUE|duplicate key/i.test(String(error))) die('bu e-posta zaten kayıtlı.');
      throw error;
    }

    console.log(`\nAcente hesabı açıldı: ${email} (${agency.name})`);
    console.log(`Parola: ${password}`);
    console.log('\nBu parola bir daha gösterilmeyecek. Giriş: /acente\n');
    break;
  }

  case 'reset': {
    const [email] = args;
    if (!email) die('e-posta gerekli.');

    const password = generatePassword();
    const result = await db.run('UPDATE agency_users SET password_hash = ? WHERE email = ?', [
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
      die('kullanım: status <e-posta> <active|suspended>');
    }

    const result = await db.run('UPDATE agency_users SET status = ? WHERE email = ?', [
      status,
      email.trim().toLowerCase(),
    ]);
    if (result.changes !== 1) die('hesap bulunamadı.');

    // Askıya alma ANINDA etkili: yetki her istekte veritabanından türetiliyor,
    // çerezden değil. Elindeki çerezle portala giremez.
    console.log(`${email} -> ${status}`);
    break;
  }

  default:
    die('bilinmeyen komut.');
}

await db.close();
