/**
 * Tanıtım için "dolu bir gün" kurar.
 *
 * `demo-seed.mjs` işletmeleri, ilanları ve takvimi üretiyor ama rezervasyon
 * üretmiyor — bu doğru, çünkü asıl akışta rezervasyonu müşteri yapar. Ne var
 * ki panel müşteriye gösterilirken **boş bir Bugün ekranı** hiçbir şey
 * anlatmıyor: günün akışı, beklenen tahsilat, hak ediş bakiyesi, check-in
 * düğmeleri — hepsi ancak veriyle görünür hâle geliyor.
 *
 * Bu betik o günü kuruyor. Üretilen her şey uydurmadır ve site tanıtım
 * kipinde olduğu için ziyaretçiye de öyle söyleniyor.
 *
 * **Kapasite tutarlılığı bozulmuyor.** Rezervasyonlar doğrudan tabloya
 * yazılıp `slots.booked` elle artırılmıyor; uygulamanın kullandığı KOŞULLU
 * UPDATE'in aynısı çalıştırılıyor. Aksi hâlde bu betik, sistemin varlık
 * sebebi olan tutarsızlığı (RASTLA'da boş görünen dolu saat) kendi eliyle
 * üretirdi.
 *
 * Kullanım:
 *   DATABASE_URL=… node scripts/demo-gun.mjs            # TCP ile
 *   NEON_HTTP=1 DATABASE_URL=… node scripts/demo-gun.mjs # 5432 kapalıysa
 */
import { randomUUID, randomBytes } from 'node:crypto';
import { db as connect } from '../lib/db/index.mjs';
import { neonHttpClient } from './lib/neon-http.mjs';
import { DEFAULT_COMMISSION_BP } from '../lib/commission.mjs';
import { quote } from '../lib/pricing.mjs';

const OPERATOR = process.env.DEMO_OPERATOR ?? 'demo-marti-koyu';

const db = process.env.NEON_HTTP === '1'
  ? neonHttpClient(process.env.DATABASE_URL)
  : await connect();

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function generateCode() {
  let out = '';
  for (const byte of randomBytes(20)) out += ALPHABET[byte % ALPHABET.length];
  return out.match(/.{1,4}/g).join('-');
}

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
  now.getDate()
).padStart(2, '0')}`;

/**
 * Günün senaryosu.
 *
 * Kanallar ve ödeme biçimleri bilinçli olarak karışık: panelin anlattığı asıl
 * şey "bütün kanallarınız tek takvimde" ve bu, ancak listede telefondan gelen
 * bir kayıtla RASTLA'dan gelen bir kayıt yan yana dururken görülüyor.
 */
const GUESTS = [
  { name: 'Elif Yıldız',    phone: '905321110001', people: 2, source: 'rastla',    payment: 'online' },
  { name: 'Murat Kaya',     phone: '905321110002', people: 1, source: 'rastla',    payment: 'online' },
  { name: 'Selin Aksoy',    phone: '905321110003', people: 3, source: 'phone',     payment: 'onsite' },
  { name: 'Deniz Arslan',   phone: '905321110004', people: 2, source: 'whatsapp',  payment: 'onsite' },
  { name: 'Burak Şahin',    phone: '905321110005', people: 2, source: 'instagram', payment: 'onsite' },
  { name: 'Ayça Demir',     phone: '905321110006', people: 4, source: 'hotel',     payment: 'onsite' },
];

const slots = await db.all(
  `SELECT s.id, s.activity_id, s.slot_time, s.capacity, s.booked, a.slug, a.price_try,
          a.capacity_mode
     FROM slots s JOIN activities a ON a.id = s.activity_id
    WHERE a.operator_id = ? AND s.slot_date = ? AND s.status = 'open'
    ORDER BY s.slot_time`,
  [OPERATOR, today]
);

if (slots.length === 0) {
  console.error(`${OPERATOR} için bugün (${today}) açık slot yok. demo-seed çalıştırıldı mı?`);
  process.exit(1);
}

console.log(`${OPERATOR} · ${today} · ${slots.length} açık slot\n`);

/**
 * Fiyat kuralları ve grup indirimleri — tanıtım günü de gerçek tarifeyi
 * kullanıyor.
 *
 * `kişi × liste fiyatı` yazılsaydı, sezon tarifesi tanımlı bir işletmede
 * tanıtım ekranındaki ciro paneldeki gerçek hesapla uyuşmazdı; müşteriye
 * gösterilen ilk sayının yanlış olduğu yer burası olurdu.
 */
const rulesByActivity = new Map();
const discountsByActivity = new Map();
for (const row of await db.all(
  `SELECT r.* FROM price_rules r JOIN activities a ON a.id = r.activity_id
    WHERE a.operator_id = ?`,
  [OPERATOR]
)) {
  const list = rulesByActivity.get(row.activity_id) ?? [];
  list.push({
    id: row.id,
    label: row.label,
    priority: Number(row.priority),
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    weekdays: Number(row.weekdays),
    startTime: row.start_time,
    endTime: row.end_time,
    priceTRY: Number(row.price_try),
    createdAt: row.created_at,
  });
  rulesByActivity.set(row.activity_id, list);
}
for (const row of await db.all(
  `SELECT d.* FROM group_discounts d JOIN activities a ON a.id = d.activity_id
    WHERE a.operator_id = ?`,
  [OPERATOR]
)) {
  const list = discountsByActivity.get(row.activity_id) ?? [];
  list.push({ minPeople: Number(row.min_people), percent: Number(row.percent) });
  discountsByActivity.set(row.activity_id, list);
}

let created = 0;
for (let i = 0; i < GUESTS.length; i++) {
  const guest = GUESTS[i];
  const slot = slots[i % slots.length];
  const units = slot.capacity_mode === 'per_person' ? guest.people : 1;

  // Uygulamanın ifadesinin AYNISI: kapasite tek koşullu UPDATE ile tutuluyor.
  const held = await db.run(
    `UPDATE slots SET booked = booked + ?
      WHERE id = ? AND status = 'open' AND booked + ? <= capacity`,
    [units, slot.id, units]
  );
  if (held.changes !== 1) {
    console.log(`  atlandı (yer yok): ${guest.name} · ${slot.slot_time}`);
    continue;
  }

  // Müşteri kaydı telefondan eşleşir; yoksa açılır.
  let user = await db.get('SELECT id FROM users WHERE phone = ?', [guest.phone]);
  if (!user) {
    const id = randomUUID();
    await db.run('INSERT INTO users (id, name, phone, created_at) VALUES (?, ?, ?, ?)', [
      id,
      guest.name,
      guest.phone,
      new Date().toISOString(),
    ]);
    user = { id };
  }

  const bookingId = randomUUID();
  const code = generateCode();
  const total = quote({
    basePrice: Number(slot.price_try),
    rules: rulesByActivity.get(slot.activity_id) ?? [],
    discounts: discountsByActivity.get(slot.activity_id) ?? [],
    date: today,
    time: slot.slot_time,
    people: guest.people,
  }).total;
  const online = guest.payment === 'online';

  await db.run(
    `INSERT INTO bookings
       (id, code, user_id, activity_slug, operator_id, slot_id, units, equipment_units,
        source, payment_mode, booking_date, booking_time, adults, children, total_try,
        status, created_at, confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, ?, 'confirmed', ?, ?)`,
    [
      bookingId, code, user.id, slot.slug, OPERATOR, slot.id, units,
      guest.source, guest.payment, today, slot.slot_time, guest.people, total,
      new Date().toISOString(), new Date().toISOString(),
    ]
  );

  // Online ödenenlerde ödeme ve hak ediş kaydı da doğuyor — Hak Ediş ekranının
  // bekleyen bakiyesi buradan geliyor. Tesiste ödenenlerde ikisi de YOK:
  // o parayı işletme kendisi tahsil ediyor, RASTLA'nın aktaracağı bir şey yok.
  if (online) {
    const paymentId = randomUUID();
    const commission = Math.floor((total * DEFAULT_COMMISSION_BP) / 10000);
    await db.run(
      `INSERT INTO payments (id, booking_id, provider, provider_ref, conversation_id,
         amount_try, commission_try, currency, status, item_transaction_ref,
         card_family, card_last_four, created_at, updated_at)
       VALUES (?, ?, 'demo', ?, ?, ?, ?, 'TRY', 'succeeded', ?, 'Test Kart', '4242', ?, ?)`,
      [
        paymentId, bookingId, `demo-${bookingId.slice(0, 8)}`, bookingId,
        total, commission, `demo-item-${bookingId.slice(0, 8)}`,
        new Date().toISOString(), new Date().toISOString(),
      ]
    );
    await db.run(
      `INSERT INTO payouts (id, booking_id, payment_id, operator_id, gross_try,
         commission_try, refunded_try, net_try, status, provider_ref, held_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'held', ?, ?)`,
      [
        randomUUID(), bookingId, paymentId, OPERATOR, total, commission,
        total - commission, `demo-item-${bookingId.slice(0, 8)}`, new Date().toISOString(),
      ]
    );
  }

  created++;
  console.log(
    `  ${slot.slot_time}  ${guest.name.padEnd(14)} ${String(guest.people)} kişi  ` +
      `${guest.source.padEnd(10)} ${online ? 'online' : 'tesiste'}  bilet ${code}`
  );
}

console.log(`\n${created} rezervasyon oluşturuldu.`);

const summary = await db.get(
  `SELECT COUNT(*) AS n, COALESCE(SUM(total_try),0) AS ciro
     FROM bookings WHERE operator_id = ? AND booking_date = ?`,
  [OPERATOR, today]
);
const payout = await db.get(
  `SELECT COALESCE(SUM(net_try),0) AS bekleyen FROM payouts
    WHERE operator_id = ? AND status = 'held'`,
  [OPERATOR]
);
console.log(`Bugün: ${summary.n} rezervasyon · ${summary.ciro} TL`);
console.log(`Bekleyen hak ediş: ${payout.bekleyen} TL`);

if (db.close) await db.close();
