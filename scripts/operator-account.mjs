/**
 * İşletme hesabı yönetimi — sunucu tarafı kurtarma aracı.
 *
 * Günlük işler uygulamadan yapılır (/isletme/ekip). Bu betik yalnızca
 * uygulamadan girilemeyen durumlar içindir:
 *   - yeni bir işletme eklemek,
 *   - tek sahip parolasını kaybettiğinde sıfırlamak,
 *   - hangi hesapların var olduğunu sunucudan görmek.
 *
 * Kullanım:
 *   node scripts/operator-account.mjs list
 *   node scripts/operator-account.mjs add-operator <id> "<Ad>"
 *   node scripts/operator-account.mjs add-user <isletme-id> <e-posta> "<Ad Soyad>" [owner|staff]
 *   node scripts/operator-account.mjs reset <e-posta>
 *   node scripts/operator-account.mjs status <e-posta> <active|suspended>
 *
 * Üretilen parolalar yalnızca burada yazdırılır; veritabanında özet saklanır.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { generatePassword, hashPassword } from '../lib/password.mjs';
import { db as connect } from '../lib/db/index.mjs';

// Uygulamayla aynı bağlantı katmanı: DATABASE_URL varsa Postgres, yoksa SQLite.
// Kurtarma aracının üretim veritabanına bağlanabilmesi gerekiyor.
const db = await connect();

const USAGE = readFileSync(new URL(import.meta.url), 'utf8')
  .split('\n')
  .slice(1, 18)
  .map((l) => l.replace(/^ \* ?/, '').replace(/^ \*\/?$/, ''))
  .join('\n');

function die(message) {
  console.error(`Hata: ${message}\n`);
  console.error(USAGE);
  process.exit(1);
}

/** Komut bittiğinde bağlantıyı kapatır; Postgres havuzu açık kalmasın. */
async function done() {
  await db.close();
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'list': {
    const operators = await db.all('SELECT * FROM operators ORDER BY name');
    if (operators.length === 0) {
      console.log('Hiç işletme yok. Önce: add-operator <id> "<Ad>"');
      break;
    }
    for (const o of operators) {
      console.log(`\n${o.name}  (${o.id})`);
      const users = await db.all(
        'SELECT * FROM operator_users WHERE operator_id = ? ORDER BY role, name',
        [o.id]
      );

      if (users.length === 0) {
        console.log('  — hesap yok, kimse giremez');
        continue;
      }
      for (const u of users) {
        const last = u.last_login_at
          ? new Date(u.last_login_at).toLocaleString('tr-TR')
          : 'hiç girmedi';
        console.log(
          `  ${u.status === 'active' ? '●' : '○'} ${u.name} <${u.email}> — ${u.role}, son giriş: ${last}`
        );
      }
    }
    break;
  }

  case 'add-operator': {
    const [id, name] = args;
    if (!id || !name) die('id ve ad gerekli.');
    if (!/^[a-z0-9-]+$/.test(id)) die('id yalnızca küçük harf, rakam ve tire içerebilir.');

    await db.run(
      `INSERT INTO operators (id, name, created_at) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
      [id, name, new Date().toISOString()]
    );

    console.log(`İşletme kaydedildi: ${name} (${id})`);
    console.log(`Sıradaki adım: add-user ${id} <e-posta> "<Ad Soyad>" owner`);
    break;
  }

  case 'add-user': {
    const [operatorId, email, name, role = 'staff'] = args;
    if (!operatorId || !email || !name) die('işletme id, e-posta ve ad gerekli.');
    if (role !== 'owner' && role !== 'staff') die('yetki owner ya da staff olmalı.');
    if (!(await db.get('SELECT 1 FROM operators WHERE id = ?', [operatorId]))) {
      die(`işletme bulunamadı: ${operatorId}`);
    }

    const password = generatePassword();
    try {
      await db.run(
        `INSERT INTO operator_users
           (id, operator_id, email, name, password_hash, role, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          randomUUID(),
          operatorId,
          email.trim().toLowerCase(),
          name,
          hashPassword(password),
          role,
          new Date().toISOString(),
        ]
      );
    } catch (error) {
      const message = String(error);
      if (message.includes('UNIQUE') || message.includes('duplicate key')) {
        die(`bu e-posta zaten kayıtlı: ${email}`);
      }
      throw error;
    }

    console.log(`Hesap oluşturuldu: ${name} <${email}> — ${role}`);
    console.log(`Parola (bir daha gösterilmez): ${password}`);
    break;
  }

  case 'reset': {
    const [email] = args;
    if (!email) die('e-posta gerekli.');

    const password = generatePassword();
    const result = await db.run('UPDATE operator_users SET password_hash = ? WHERE email = ?', [
      hashPassword(password),
      email.trim().toLowerCase(),
    ]);

    if (result.changes === 0) die(`hesap bulunamadı: ${email}`);

    console.log(`${email} için yeni parola (bir daha gösterilmez): ${password}`);
    break;
  }

  // Uygulamadaki karşılığının aksine burada "son sahip" koruması yoktur:
  // sunucuya erişebilen kişi zaten her şeyi yapabilir ve tıkanma hâlinde
  // `reset` ile geri dönülebilir.
  case 'status': {
    const [email, status] = args;
    if (!email || (status !== 'active' && status !== 'suspended')) {
      die('e-posta ve active|suspended gerekli.');
    }

    const result = await db.run('UPDATE operator_users SET status = ? WHERE email = ?', [
      status,
      email.trim().toLowerCase(),
    ]);

    if (result.changes === 0) die(`hesap bulunamadı: ${email}`);
    console.log(`${email} → ${status}`);
    break;
  }

  default:
    die(command ? `bilinmeyen komut: ${command}` : 'komut girin.');
}

await done();
