/**
 * Şube süzgeci ve çoklu işletme erişiminin testi.
 *
 * İki ayrı iddia var ve ikisi çok farklı ağırlıkta:
 *
 *   ŞUBE bir SÜZGEÇ. Yanlış çalışırsa personel yanlış listeye bakar — can
 *   sıkıcı ama tehlikeli değil. Bu yüzden burada sınanan şey doğruluk:
 *   süzgeç başka şubenin rezervasyonunu göstermiyor ve süzgeci olmayan
 *   görünüm hepsini gösteriyor.
 *
 *   ÜYELİK bir YETKİ SINIRI. Yanlış çalışırsa bir işletme başka bir
 *   işletmenin müşteri listesini, cirosunu ve banka bilgisini görür. Bu
 *   yüzden asıl test şu: **çerez elle değiştirilerek üyeliği olmayan bir
 *   işletmeye geçilemiyor** — ve bu, arayüzdeki seçiciden değil, çerezi
 *   doğrudan yazarak sınanıyor. Seçiciyi test etmek yalnızca seçiciyi test
 *   ederdi; saldırgan seçiciyi kullanmaz.
 *
 * Sınananlar:
 *   1. Şube süzgeci yalnızca o şubenin ilanlarına ait rezervasyonları veriyor.
 *   2. Süzgeçsiz görünüm hepsini veriyor.
 *   3. Başka bir işletmenin şube kimliği süzgece verilirse SESSİZCE yok
 *      sayılıyor ve veri sızmıyor.
 *   4. Şube silinince ilanlar SİLİNMİYOR, şubesiz kalıyor.
 *   5. Üyeliği olmayan işletmeye çerez elle yazılarak GEÇİLEMİYOR.
 *   6. Üyelik verilince geçilebiliyor ve rol ÜYELİKTEKİ rol oluyor — hesabın
 *      kendi işletmesindeki rolü değil.
 *   7. Üyelik geri alınınca erişim ANINDA düşüyor (çerez hâlâ elindeyken).
 *   8. Askıya alınmış hesap üyeliği dursa da hiçbir işletmeye giremiyor.
 *
 * Kullanım:
 *   npm start > server.log &
 *   node scripts/verify-branches.mjs
 */
import { chromium } from 'playwright';
import { createHmac, randomUUID } from 'node:crypto';
import { db as connect } from '../lib/db/index.mjs';
import { ensureTestAccounts, emailFor, loginAs } from './lib/test-accounts.mjs';

/**
 * Çerezi uygulamanın kendi imzasıyla üretir.
 *
 * Gerçek bir saldırgan `SESSION_SECRET`'ı bilmez ve geçerli imzalı bir çerez
 * üretemez. Burada bilinçli olarak ona bu gücü VERİYORUZ: sınanmak istenen şey
 * imzanın çalışıp çalışmadığı değil (o zaten `verify-accounts` işi), imza
 * geçerliyken bile YETKİNİN AYRICA sorulup sorulmadığı. İmzaya güvenip yetkiyi
 * atlayan bir kod bu testten geçemez.
 */
function packCookie(value) {
  const secret = process.env.SESSION_SECRET ?? 'gelistirme-icin-guvensiz-varsayilan';
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
}

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const OPERATOR = 'buyukcekmece-wsc';
const OTHER = 'mimarsinan-marina';

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

const store = await connect();
await ensureTestAccounts();

const now = new Date().toISOString();
const tag = Date.now();

// =====================================================================
// Kurulum — iki şube, her birine bir ilan ve bir rezervasyon
// =====================================================================

const branchA = randomUUID();
const branchB = randomUUID();

await store.run(
  'INSERT INTO branches (id, operator_id, name, created_at) VALUES (?, ?, ?, ?)',
  [branchA, OPERATOR, `İskele A ${tag}`, now]
);
await store.run(
  'INSERT INTO branches (id, operator_id, name, created_at) VALUES (?, ?, ?, ?)',
  [branchB, OPERATOR, `İskele B ${tag}`, now]
);

// Başka bir İŞLETMENİN şubesi: süzgece verildiğinde yok sayılmalı.
const foreignBranch = randomUUID();
await store.run(
  'INSERT INTO branches (id, operator_id, name, created_at) VALUES (?, ?, ?, ?)',
  [foreignBranch, OTHER, `Yabancı ${tag}`, now]
);

const day = '2026-09-15';

async function seedActivity(branchId, suffix) {
  const id = randomUUID();
  const slug = `sube-test-${suffix}-${tag}`;

  await store.run(
    `INSERT INTO activities (id, operator_id, slug, title, category, price_try, duration_minutes,
       location_name, capacity_mode, branch_id, status, created_at)
     VALUES (?, ?, ?, ?, 'jet-ski', 500, 30, 'Sahil', 'per_person', ?, 'published', ?)`,
    [id, OPERATOR, slug, `Şube Testi ${suffix} ${tag}`, branchId, now]
  );

  const slotId = randomUUID();
  await store.run(
    `INSERT INTO slots (id, activity_id, slot_date, slot_time, capacity, booked, status, created_at)
     VALUES (?, ?, ?, '10:00', 10, 2, 'open', ?)`,
    [slotId, id, day, now]
  );

  const userId = randomUUID();
  await store.run('INSERT INTO users (id, phone, name, created_at) VALUES (?, ?, ?, ?)', [
    userId,
    `9055500${String(tag).slice(-5)}${suffix === 'a' ? '1' : '2'}`,
    `Şube Misafiri ${suffix}`,
    now,
  ]);

  const code = `SUBE-${suffix.toUpperCase()}-${tag}`;
  await store.run(
    `INSERT INTO bookings (id, code, user_id, activity_slug, operator_id, slot_id, units,
       booking_date, booking_time, adults, children, total_try, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 2, ?, '10:00', 2, 0, 1000, 'confirmed', ?)`,
    [randomUUID(), code, userId, slug, OPERATOR, slotId, day, now]
  );

  return { id, slug, code };
}

const actA = await seedActivity(branchA, 'a');
const actB = await seedActivity(branchB, 'b');

// =====================================================================
// BÖLÜM A — Süzgeç
// =====================================================================

// Kutudaki Playwright'ın beklediği yapı ile kurulu tarayıcı sürümü aynı
// değil; diğer süitlerle aynı yolu kullanıyoruz.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

async function freshPage() {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function bookingsText(page, params) {
  const query = new URLSearchParams({ gun: day, ...params }).toString();
  await page.goto(`${BASE}/isletme/rezervasyonlar?${query}`, { waitUntil: 'networkidle' });
  return page.locator('body').innerText();
}

{
  const { context, page } = await freshPage();
  await loginAs(page, BASE, OPERATOR, 'owner');

  const all = await bookingsText(page, {});
  check(
    'süzgeçsiz görünüm İKİ şubenin rezervasyonunu da gösteriyor',
    all.includes(actA.code) && all.includes(actB.code)
  );

  const onlyA = await bookingsText(page, { sube: branchA });
  check(
    'şube süzgeci yalnızca O ŞUBENİN rezervasyonunu gösteriyor',
    onlyA.includes(actA.code) && !onlyA.includes(actB.code),
    `A: ${onlyA.includes(actA.code)}, B: ${onlyA.includes(actB.code)}`
  );

  const onlyB = await bookingsText(page, { sube: branchB });
  check(
    'diğer şube süzgeci de kendi rezervasyonunu gösteriyor',
    onlyB.includes(actB.code) && !onlyB.includes(actA.code)
  );

  // Başka bir işletmenin şube kimliği: süzgeç yok sayılmalı ve HİÇBİR veri
  // sızmamalı. Hata sayfası göstermek "böyle bir şube var ama sizin değil"
  // demek olurdu.
  const foreign = await bookingsText(page, { sube: foreignBranch });
  check(
    'başka işletmenin şube kimliği süzgeçte sessizce yok sayılıyor',
    foreign.includes(actA.code) && foreign.includes(actB.code),
    'süzgeçsiz görünüme düşüldü'
  );

  const garbage = await bookingsText(page, { sube: 'olmayan-sube-kimligi' });
  check(
    'uydurma şube kimliği hata üretmiyor',
    garbage.includes(actA.code) && garbage.includes(actB.code)
  );

  await context.close();
}

// ---------- Şube silinince ilanlar duruyor ----------

{
  const { deleteBranch } = await import('../lib/db/branches.ts');
  await deleteBranch(branchB, OPERATOR);

  const activity = await store.get('SELECT branch_id FROM activities WHERE id = ?', [actB.id]);
  check(
    'şube silinince ilan SİLİNMİYOR, şubesiz kalıyor',
    activity !== undefined && activity !== null && activity.branch_id === null,
    `satır duruyor: ${activity !== undefined && activity !== null}, branch_id: ${String(activity?.branch_id)}`
  );

  const booking = await store.get('SELECT status FROM bookings WHERE code = ?', [actB.code]);
  check(
    'şube silinince rezervasyonlar duruyor',
    booking?.status === 'confirmed',
    `durum: ${booking?.status}`
  );
}

// =====================================================================
// BÖLÜM B — Üyelik: asıl yetki sınırı
// =====================================================================
//
// Buradaki testler ARAYÜZDEN GEÇMİYOR. Seçiciyi kullanmak yalnızca seçiciyi
// sınardı; saldırgan seçiciyi kullanmaz, çerezi yazar.

const ownerEmail = emailFor(OPERATOR, 'owner');
const ownerRow = await store.get('SELECT id FROM operator_users WHERE email = ?', [ownerEmail]);

/**
 * Çerezi elle yazıp panele girer, hangi işletmede olduğunu döndürür.
 *
 * Çerez imzalı olduğu için uygulamanın kendi imzalama fonksiyonu kullanılıyor:
 * rastgele bir dizgi yazmak yalnızca "bozuk imza reddediliyor" iddiasını
 * sınardı, oysa asıl soru GEÇERLİ İMZALI ama yetkisiz bir çerezin ne yaptığı.
 */
async function operatorNameWithCookie(operatorId) {
  const { context, page } = await freshPage();
  await loginAs(page, BASE, OPERATOR, 'owner');

  await context.addCookies([
    { name: 'rastla_operator_aktif', value: packCookie(operatorId), url: BASE },
  ]);

  await page.goto(`${BASE}/isletme/bugun`, { waitUntil: 'networkidle' });

  // Yalnızca KİMLİK SATIRI okunuyor, başlığın tamamı değil. Başlıkta işletme
  // seçici de var ve orada kişinin DİĞER işletmelerdeki rolleri yazıyor;
  // tamamına bakan bir eşleşme "burada saha personeli" iddiasını, seçicideki
  // "orada sahip" satırı yüzünden yanlış yere düşürürdü.
  const operatorName = (await page.locator('header p').first().innerText()).trim();
  const identity = (await page.locator('header p').nth(1).innerText()).trim();

  await context.close();
  return { operatorName, identity };
}

const otherOperator = await store.get('SELECT name FROM operators WHERE id = ?', [OTHER]);
const ownOperator = await store.get('SELECT name FROM operators WHERE id = ?', [OPERATOR]);

{
  const header = await operatorNameWithCookie(OTHER);
  check(
    'ÜYELİĞİ OLMAYAN işletmeye çerez elle yazılarak GEÇİLEMİYOR',
    header.operatorName === ownOperator.name,
    header.operatorName
  );
}

// ---------- Üyelik verilince geçilebiliyor, rol ÜYELİKTEKİ rol ----------

await store.run(
  `INSERT INTO operator_memberships (id, operator_user_id, operator_id, role, created_at)
   VALUES (?, ?, ?, 'staff', ?)`,
  [randomUUID(), ownerRow.id, OTHER, now]
);

{
  const header = await operatorNameWithCookie(OTHER);
  check(
    'üyelik verilince o işletmeye geçilebiliyor',
    header.operatorName === otherOperator.name,
    header.operatorName
  );
  check(
    'rol ÜYELİKTEKİ rol — kendi işletmesinde sahip olan burada saha personeli',
    header.identity.includes('Saha personeli') && !header.identity.includes('Sahip'),
    header.identity
  );
  check(
    'konuk erişimi olduğu AÇIKÇA yazıyor',
    header.identity.includes('konuk erişimi'),
    header.identity
  );
}

// ---------- Üyelik geri alınınca erişim ANINDA düşüyor ----------

await store.run(
  'DELETE FROM operator_memberships WHERE operator_user_id = ? AND operator_id = ?',
  [ownerRow.id, OTHER]
);

{
  const header = await operatorNameWithCookie(OTHER);
  check(
    'üyelik geri alınınca erişim ANINDA düşüyor — çerez hâlâ elindeyken',
    header.operatorName === ownOperator.name && !header.identity.includes('konuk erişimi'),
    `${header.operatorName} · ${header.identity}`
  );
}

// ---------- Askıya alınmış hesap hiçbir işletmeye giremiyor ----------

{
  const { roleAt } = await import('../lib/db/memberships.ts');

  await store.run(
    `INSERT INTO operator_memberships (id, operator_user_id, operator_id, role, created_at)
     VALUES (?, ?, ?, 'manager', ?)`,
    [randomUUID(), ownerRow.id, OTHER, now]
  );
  check(
    'aktif hesap üyelik verilen işletmede rol alıyor',
    (await roleAt(ownerRow.id, OTHER)) === 'manager'
  );

  await store.run("UPDATE operator_users SET status = 'suspended' WHERE id = ?", [ownerRow.id]);
  check(
    'ASKIYA ALINMIŞ hesap üyeliği dursa da rol ALMIYOR',
    (await roleAt(ownerRow.id, OTHER)) === null
  );
  check(
    'askıya alınmış hesap KENDİ işletmesinde de rol almıyor',
    (await roleAt(ownerRow.id, OPERATOR)) === null
  );

  await store.run("UPDATE operator_users SET status = 'active' WHERE id = ?", [ownerRow.id]);
  await store.run(
    'DELETE FROM operator_memberships WHERE operator_user_id = ? AND operator_id = ?',
    [ownerRow.id, OTHER]
  );
}

// ---------- Ana işletmeye üyelik verilemiyor ----------

{
  const { grantMembership } = await import('../lib/db/memberships.ts');
  const result = await grantMembership({
    operatorUserId: ownerRow.id,
    operatorId: OPERATOR,
    role: 'staff',
  });
  check(
    'kendi ana işletmesine ayrıca üyelik VERİLEMİYOR — iki rol kaydı çıkardı',
    result.ok === false && result.reason === 'already_primary',
    result.ok ? 'geçti' : result.reason
  );
}

// ---------- Aynı üyelik iki kez verilince rol güncelleniyor ----------

{
  const { grantMembership, listMemberships } = await import('../lib/db/memberships.ts');

  await grantMembership({ operatorUserId: ownerRow.id, operatorId: OTHER, role: 'staff' });
  await grantMembership({ operatorUserId: ownerRow.id, operatorId: OTHER, role: 'manager' });

  const rows = await store.all(
    'SELECT role FROM operator_memberships WHERE operator_user_id = ? AND operator_id = ?',
    [ownerRow.id, OTHER]
  );
  check(
    'aynı üyelik iki kez verilince İKİNCİ SATIR açılmıyor, rol güncelleniyor',
    rows.length === 1 && rows[0].role === 'manager',
    `satır: ${rows.length}, rol: ${rows[0]?.role}`
  );

  const memberships = await listMemberships(ownerRow.id);
  check(
    'erişilebilir işletme listesi ANA işletmeyi de içeriyor ve başta',
    memberships.length === 2 && memberships[0].primary === true,
    memberships.map((m) => `${m.operatorName}${m.primary ? '*' : ''}`).join(', ')
  );

  await store.run(
    'DELETE FROM operator_memberships WHERE operator_user_id = ? AND operator_id = ?',
    [ownerRow.id, OTHER]
  );
}

await browser.close();

// Temizlik: bu koşunun açtığı satırlar sonraki koşuları etkilemesin.
await store.run('DELETE FROM bookings WHERE code LIKE ?', [`SUBE-%-${tag}`]);
await store.run('DELETE FROM slots WHERE activity_id IN (?, ?)', [actA.id, actB.id]);
await store.run('DELETE FROM activities WHERE id IN (?, ?)', [actA.id, actB.id]);
await store.run('DELETE FROM branches WHERE id IN (?, ?, ?)', [branchA, branchB, foreignBranch]);
await store.close();

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'GEÇTİ' : 'KALDI'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} kontrol geçti`);
process.exit(failed ? 1 : 0);
