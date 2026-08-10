/**
 * Tanıtım için **dolu bir takvim** kurar.
 *
 * `demo-seed.mjs` işletmeleri, ilanları ve takvimi üretiyor ama rezervasyon
 * üretmiyor — bu doğru, çünkü asıl akışta rezervasyonu müşteri yapar. Ne var
 * ki panel müşteriye gösterilirken **boş bir Bugün ekranı** hiçbir şey
 * anlatmıyor: günün akışı, beklenen tahsilat, hak ediş bakiyesi, check-in
 * düğmeleri, doluluk — hepsi ancak veriyle görünür hâle geliyor.
 *
 * Bu betik o takvimi kuruyor. Üretilen her şey uydurmadır ve site tanıtım
 * kipinde olduğu için ziyaretçiye de öyle söyleniyor.
 *
 * **Kapasite tutarlılığı bozulmuyor.** Rezervasyonlar doğrudan tabloya
 * yazılıp `slots.booked` elle artırılmıyor; uygulamanın kullandığı KOŞULLU
 * UPDATE'in aynısı çalıştırılıyor. Aksi hâlde bu betik, sistemin varlık
 * sebebi olan tutarsızlığı (RASTLA'da boş görünen dolu saat) kendi eliyle
 * üretirdi.
 *
 * **Tekrar çalıştırmak güvenli.** Hedef doluluk MEVCUT doluluğun üzerine
 * eklenmiyor, ona göre hesaplanıyor: ikinci çalıştırma takvimi ikiye
 * katlamıyor, hedefe yaklaştırıyor. Bir tanıtımdan önce "biraz daha dolu
 * olsun" demek, betiği yeniden çalıştırmak kadar basit olmalı.
 *
 * **Geri alınabilir.** Ürettiği her müşteri kaydının telefonu
 * `90532111…` ile başlıyor; `--temizle` bu izden giderek yalnızca kendi
 * ürettiğini siliyor. Üretim veritabanına uydurma veri yazan bir aracın
 * geri dönüşü olmadan bırakılması kabul edilemezdi.
 *
 * Kullanım:
 *   DATABASE_URL=… node scripts/demo-gun.mjs
 *   DATABASE_URL=… node scripts/demo-gun.mjs --doluluk 70 --gecmis 10 --gelecek 21
 *   DATABASE_URL=… node scripts/demo-gun.mjs --temizle
 *   NEON_HTTP=1 DATABASE_URL=… node scripts/demo-gun.mjs   # 5432 kapalıysa
 */
import { randomUUID, randomBytes } from 'node:crypto';
import { db as connect } from '../lib/db/index.mjs';
import { neonHttpClient } from './lib/neon-http.mjs';
import { DEFAULT_COMMISSION_BP } from '../lib/commission.mjs';
import { quote } from '../lib/pricing.mjs';

const OPERATOR = process.env.DEMO_OPERATOR ?? 'demo-marti-koyu';

/**
 * Üretilen müşterilerin telefon öneki — **temizliğin tek dayanağı.**
 *
 * Ayrı bir "bu kayıt sahte" sütunu açmak, şemaya yalnızca tanıtım için bir
 * alan eklemek olurdu ve o alan er geç gerçek bir kararın parçası hâline
 * gelirdi. Telefon öneki hem yeterli hem de veriye hiçbir şey borçlu değil.
 */
const DEMO_PHONE_PREFIX = '90532111';

// ------------------------------------------------------------ argümanlar

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(argv[i + 1]);
  return Number.isFinite(value) ? value : fallback;
};

const CLEAN = argv.includes('--temizle');
const TARGET = Math.min(100, Math.max(0, flag('doluluk', 70))) / 100;
const PAST_DAYS = Math.max(0, flag('gecmis', 7));
const FUTURE_DAYS = Math.max(0, flag('gelecek', 14));

const db =
  process.env.NEON_HTTP === '1'
    ? neonHttpClient(process.env.DATABASE_URL)
    : await connect();

// ------------------------------------------------------------- yardımcılar

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function generateCode() {
  let out = '';
  for (const byte of randomBytes(20)) out += ALPHABET[byte % ALPHABET.length];
  return out.match(/.{1,4}/g).join('-');
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function shiftDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

const TODAY = isoDate(new Date());

/**
 * Tohumlu rastgelelik.
 *
 * `Math.random()` kullanılsaydı her çalıştırma başka bir takvim üretirdi ve
 * "dün şu saat doluydu, bugün neden boş" sorusunun cevabı olmazdı. Aynı
 * argümanlarla aynı takvim çıksın diye sabit tohumlu bir üreteç var.
 */
let seed = 20260810;
function random() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

/**
 * Çok satırlı INSERT — parça parça.
 *
 * Uzak bir veritabanına HTTPS üzerinden kayıt başına bir istek atmak, bin
 * kayıtlık bir takvimi doksan dakikaya çıkarıyordu. Satırlar tek ifadede
 * gönderilince aynı iş dakikalar sürüyor.
 *
 * Parça boyutu **parametre sayısına** göre: Postgres tek ifadede 65535
 * parametre kabul ediyor ve sütun sayısı arttıkça sığan satır azalıyor.
 * Sabit bir satır sayısı yazmak, sütun eklendiği gün patlardı.
 *
 * Sınır Postgres'in 65535'i DEĞİL, ondan çok daha düşük: Neon'un HTTPS SQL
 * ucu büyük gövdeleri açıklamasız `400` ile reddediyor. 60.000 parametrelik
 * bir ifade tam olarak böyle düştü ve — kapasite çoktan tutulduğu için —
 * geriye dolu görünen ama karşılığı olmayan slotlar bıraktı. 5.000 güvenli
 * tarafta kalıyor ve gidiş-dönüş sayısını hâlâ yüzde doksan azaltıyor.
 */
const MAX_PARAMS_PER_STATEMENT = 5000;

async function insertMany(table, columns, rows, suffix = '') {
  if (rows.length === 0) return;

  const perRow = columns.length;
  const chunkSize = Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / perRow));
  const tuple = `(${columns.map(() => '?').join(', ')})`;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await db.run(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${chunk.map(() => tuple).join(', ')} ${suffix}`,
      chunk.flat()
    );
  }
}

// -------------------------------------------------------------- temizlik

if (CLEAN) {
  const scope = `SELECT b.id FROM bookings b JOIN users u ON u.id = b.user_id
                  WHERE b.operator_id = ? AND u.phone LIKE '${DEMO_PHONE_PREFIX}%'`;

  // Kapasite ÖNCE geri veriliyor, kayıt sonra siliniyor. Tersi yapılsaydı
  // hangi slottan ne kadar düşüleceği bilgisi kayıtla birlikte giderdi ve
  // slotlar sonsuza kadar dolu görünürdü.
  const held = await db.all(
    `SELECT b.slot_id, b.units FROM bookings b JOIN users u ON u.id = b.user_id
      WHERE b.operator_id = ? AND u.phone LIKE '${DEMO_PHONE_PREFIX}%'
        AND b.status <> 'cancelled' AND b.slot_id IS NOT NULL`,
    [OPERATOR]
  );
  for (const row of held) {
    await db.run('UPDATE slots SET booked = booked - ? WHERE id = ? AND booked >= ?', [
      row.units,
      row.slot_id,
      row.units,
    ]);
  }

  await db.run(`DELETE FROM payouts WHERE booking_id IN (${scope})`, [OPERATOR]);
  await db.run(`DELETE FROM payments WHERE booking_id IN (${scope})`, [OPERATOR]);
  const removed = await db.run(
    `DELETE FROM bookings WHERE operator_id = ?
       AND user_id IN (SELECT id FROM users WHERE phone LIKE '${DEMO_PHONE_PREFIX}%')`,
    [OPERATOR]
  );

  console.log(`${removed.changes} tanıtım rezervasyonu silindi, kapasite geri verildi.`);
  if (db.close) await db.close();
  process.exit(0);
}

// --------------------------------------------------------------- kaynaklar

const FROM = shiftDays(-PAST_DAYS);
const TO = shiftDays(FUTURE_DAYS);

const slots = await db.all(
  `SELECT s.id, s.activity_id, s.slot_date, s.slot_time, s.capacity, s.booked,
          a.slug, a.price_try, a.capacity_mode
     FROM slots s JOIN activities a ON a.id = s.activity_id
    WHERE a.operator_id = ? AND s.status = 'open'
      AND s.slot_date BETWEEN ? AND ?
    ORDER BY s.slot_date, s.slot_time`,
  [OPERATOR, FROM, TO]
);

if (slots.length === 0) {
  console.error(`${OPERATOR} için ${FROM} – ${TO} aralığında açık slot yok.`);
  console.error('demo-seed çalıştırıldı mı? Takvim ufku bu aralığı kapsıyor mu?');
  process.exit(1);
}

/**
 * Fiyat kuralları ve grup indirimleri — tanıtım takvimi de gerçek tarifeyi
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

// ---------------------------------------------------------------- misafirler

const FIRST_NAMES = [
  'Elif', 'Murat', 'Selin', 'Deniz', 'Burak', 'Ayça', 'Kerem', 'Zeynep', 'Emre',
  'Ceren', 'Onur', 'Merve', 'Baran', 'İrem', 'Tolga', 'Sude', 'Cem', 'Nazlı',
  'Ege', 'Pınar', 'Yiğit', 'Damla', 'Arda', 'Bengi', 'Sinan', 'Duygu',
];
const LAST_NAMES = [
  'Yıldız', 'Kaya', 'Aksoy', 'Arslan', 'Şahin', 'Demir', 'Çelik', 'Doğan',
  'Yılmaz', 'Koç', 'Aydın', 'Özkan', 'Taş', 'Bulut', 'Ergin', 'Sarı',
];

/**
 * Kanal dağılımı.
 *
 * Panelin anlattığı asıl şey "bütün kanallarınız tek takvimde" ve bu, ancak
 * listede telefondan gelen bir kayıtla RASTLA'dan gelen bir kayıt yan yana
 * dururken görülüyor. Ağırlıklar gerçekçi: pilotta çoğunluk hâlâ işletmenin
 * kendi kanallarında.
 */
const SOURCES = [
  ...Array(4).fill('rastla'),
  ...Array(3).fill('phone'),
  ...Array(2).fill('whatsapp'),
  ...Array(2).fill('instagram'),
  'hotel',
  'link',
  'manual',
];

/**
 * Sabit bir misafir havuzu — her rezervasyon için yeni kişi açılmıyor.
 *
 * İki sebep. Birincisi gerçekçilik: bir sahil işletmesinin müşterilerinin bir
 * kısmı düzenli gelir ve "Müşteriler" ekranı ancak tekrar eden isimler varken
 * bir şey anlatır. İkincisi maliyet: her kayıt için yeni kullanıcı açmak,
 * uzak veritabanına rezervasyon başına fazladan bir yazma demek.
 *
 * Ad telefondan TÜRETİLİYOR, rastgele seçilmiyor: aynı numaranın iki farklı
 * çalıştırmada iki farklı adı olsaydı, veritabanındaki kayıt ile betiğin
 * ürettiği kayıt ayrışırdı.
 */
const GUEST_POOL_SIZE = 220;
const GUESTS = Array.from({ length: GUEST_POOL_SIZE }, (_, i) => ({
  name: `${FIRST_NAMES[i % FIRST_NAMES.length]} ${
    LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length]
  }`,
  phone: `${DEMO_PHONE_PREFIX}${String(i + 1).padStart(4, '0')}`,
}));

let guestCounter = 0;

/** Havuzdan sıradaki misafir; havuz bitince başa dönülüyor. */
function nextGuest() {
  return GUESTS[guestCounter++ % GUEST_POOL_SIZE];
}

/**
 * Havuzun tamamını iki gidiş-dönüşte hazırlar: bir ekleme, bir okuma.
 *
 * Rezervasyon başına "var mı, yoksa aç" yapmak uzak bir veritabanında kayıt
 * başına iki tur demekti ve süreyi tek başına iki katına çıkarıyordu.
 * `ON CONFLICT DO NOTHING` var olanı olduğu gibi bırakıyor — tekrar
 * çalıştırıldığında isimler değişmiyor.
 */
async function loadGuestIds() {
  const stamp = new Date().toISOString();

  await insertMany(
    'users',
    ['id', 'name', 'phone', 'created_at'],
    GUESTS.map((g) => [randomUUID(), g.name, g.phone, stamp]),
    'ON CONFLICT (phone) DO NOTHING'
  );

  const rows = await db.all(
    `SELECT id, phone FROM users WHERE phone LIKE '${DEMO_PHONE_PREFIX}%'`
  );

  const byPhone = new Map(rows.map((r) => [r.phone, r.id]));
  for (const g of GUESTS) {
    if (!byPhone.has(g.phone)) throw new Error(`misafir kaydı açılamadı: ${g.phone}`);
  }
  return byPhone;
}

// ------------------------------------------------------------ hedef doluluk

/**
 * Slotun ne kadar dolması beklendiği — 0 ile 1 arası ağırlık.
 *
 * Her saati eşit doldurmak %70'lik bir ortalama üretirdi ama tanıtımda
 * inandırıcı olmazdı: gerçek bir sahilde cumartesi öğleden sonrası dolu,
 * salı sabahı boştur. İşletmenin ekranda görmek istediği şey de zaten bu
 * dalga — "hangi saatim boş" sorusunun cevabı.
 */
function weightFor(date, time) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Pazar
  const hour = Number(time.slice(0, 2));

  let w = 1;
  if (weekday === 0 || weekday === 6) w *= 1.35; // hafta sonu
  else if (weekday === 1 || weekday === 2) w *= 0.75; // pazartesi–salı sakin

  if (hour < 10) w *= 0.6; // erken sabah
  else if (hour >= 16) w *= 0.8; // akşamüstü
  else w *= 1.25; // öğle kuşağı

  return w;
}

const weights = slots.map((s) => weightFor(s.slot_date, s.slot_time));
const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;

/**
 * Slot başına hedef doluluk — **kırpılan pay geri dağıtılıyor.**
 *
 * Ağırlıkla ölçeklenen hedef, yoğun saatlerde kapasiteyi aşıyor ve orada
 * kırpılıyor. Kırpılan miktar hiçbir yere gitmezse toplam doluluk istenenin
 * altında kalıyor: %70 istendiğinde %66,7 çıkıyordu ve bayrak söylediğini
 * vermiyordu. Kaybedilen pay, hâlâ yeri olan slotlara dağıtılıyor.
 */
function planTargets() {
  const targets = slots.map((s, i) =>
    Math.min(Number(s.capacity), Math.round(Number(s.capacity) * TARGET * (weights[i] / avgWeight)))
  );

  const wanted = Math.round(totalCapacity * TARGET);

  // Birkaç tur: her turda açık kalan yerlere orantılı ekleme yapılıyor ve
  // yine kırpılabiliyor. Tek turda dağıtmak, ikinci kez taşan slotları
  // gözden kaçırırdı.
  for (let round = 0; round < 6; round++) {
    const planned = targets.reduce((a, b) => a + b, 0);
    let deficit = wanted - planned;
    if (deficit <= 0) break;

    const room = slots.map((s, i) => Number(s.capacity) - targets[i]);
    const totalRoom = room.reduce((a, b) => a + b, 0);
    if (totalRoom <= 0) break;

    for (let i = 0; i < slots.length && deficit > 0; i++) {
      if (room[i] <= 0) continue;
      const add = Math.min(room[i], deficit, Math.max(1, Math.round((deficit * room[i]) / totalRoom)));
      targets[i] += add;
      deficit -= add;
    }
  }

  return targets;
}


const totalCapacity = slots.reduce((sum, s) => sum + Number(s.capacity), 0);
const alreadyBooked = slots.reduce((sum, s) => sum + Number(s.booked), 0);

console.log(`${OPERATOR} · ${FROM} → ${TO}`);
console.log(`${slots.length} açık slot · toplam kapasite ${totalCapacity}`);
console.log(
  `mevcut doluluk: ${alreadyBooked} (%${((alreadyBooked / totalCapacity) * 100).toFixed(1)})`
);
console.log(`hedef doluluk: %${(TARGET * 100).toFixed(0)}\n`);

// Hedefler `totalCapacity` hesaplandıktan SONRA kuruluyor: kırpılan payın
// dağıtımı toplam kapasiteyi bilmek zorunda.
const targets = planTargets();// --------------------------------------------------------------- doldurma
//
// İki aşama, **öbek öbek**: önce kapasite tutulur, sonra o öbeğin kayıtları
// toplu yazılır.
//
// Kapasite tutma slot başına tek koşullu UPDATE — uygulamadaki ifadenin
// aynısı; tek farkı, o saatin bütün grubunu tek seferde tutması, tıpkı
// kalabalık bir grup rezervasyonunun yapacağı gibi.
//
// Öbekleme yalnızca hız için değil, **kurtarılabilirlik** için: yer tutmakla
// kayıt yazmak arasında bir pencere var ve o pencerede iş düşerse geriye
// dolu görünen ama karşılığı olmayan slotlar kalıyor. Bir kez yaşandı.
// Öbek küçük tutuluyor ve yazma başarısız olursa o öbeğin tuttuğu yer
// AYNI ÇALIŞTIRMADA geri bırakılıyor.

const guestIds = await loadGuestIds();

/** Bir seferde kaç slotun kapasitesi tutulup yazılacak. */
const GROUP_SIZE = 40;

const BOOKING_COLUMNS = [
  'id', 'code', 'user_id', 'activity_slug', 'operator_id', 'slot_id', 'units',
  'equipment_units', 'source', 'payment_mode', 'booking_date', 'booking_time',
  'adults', 'children', 'total_try', 'status', 'created_at', 'confirmed_at',
  'redeemed_at', 'redeemed_by', 'attended', 'cancelled_at', 'cancel_reason',
];

const PAYMENT_COLUMNS = [
  'id', 'booking_id', 'provider', 'provider_ref', 'conversation_id', 'amount_try',
  'commission_try', 'currency', 'status', 'item_transaction_ref', 'card_family',
  'card_last_four', 'created_at', 'updated_at',
];

const PAYOUT_COLUMNS = [
  'id', 'booking_id', 'payment_id', 'operator_id', 'gross_try', 'commission_try',
  'refunded_try', 'net_try', 'status', 'provider_ref', 'held_at', 'released_at',
];

let created = 0;
let cancelled = 0;
let skipped = 0;

/** Tutulan yeri geri bırakır — yalnızca yazma başarısız olduğunda. */
async function release(reservations) {
  for (const r of reservations) {
    await db.run('UPDATE slots SET booked = booked - ? WHERE id = ? AND booked >= ?', [
      r.units,
      r.slotId,
      r.units,
    ]);
  }
}

for (let g = 0; g < slots.length; g += GROUP_SIZE) {
  const group = slots.slice(g, g + GROUP_SIZE);
  const reservations = [];
  const bookingRows = [];
  const paymentRows = [];
  const payoutRows = [];

  for (let i = 0; i < group.length; i++) {
    const slot = group[i];
    const perPerson = slot.capacity_mode === 'per_person';

    const target = targets[g + i];

    // MEVCUT doluluğun üzerine değil, ona göre: tekrar çalıştırmak takvimi
    // ikiye katlamıyor.
    let missing = target - Number(slot.booked);
    if (missing <= 0) continue;

    // Bu slota yazılacak grupların listesi ÖNCE kuruluyor; kapasite tek
    // ifadede o kadar tutuluyor.
    const parties = [];
    let units = 0;
    while (missing > 0) {
      const party = pick([1, 2, 2, 2, 3, 3, 4]);
      const people = perPerson ? Math.min(missing, party) : party;
      const consumed = perPerson ? people : 1;

      parties.push(people);
      units += consumed;
      missing -= consumed;
    }

    const held = await db.run(
      `UPDATE slots SET booked = booked + ?
        WHERE id = ? AND status = 'open' AND booked + ? <= capacity`,
      [units, slot.id, units]
    );
    if (held.changes !== 1) {
      skipped += parties.length;
      continue;
    }
    reservations.push({ slotId: slot.id, units });

    // Geçmiş günler okutulmuş, gelecek günler bekliyor. Geçmişi `confirmed`
    // bırakmak, dün gelmiş bir müşterinin biletinin hâlâ geçerli görünmesi
    // demekti; Hak Ediş ekranı da hiçbir zaman serbest bakiye göstermezdi.
    const past = slot.slot_date < TODAY;
    const redeemedAt = past ? `${slot.slot_date}T${slot.slot_time}:00.000Z` : null;

    for (const people of parties) {
      const guest = nextGuest();
      const source = pick(SOURCES);

      // Kanal ödeme biçimini belirliyor: RASTLA'dan gelen online öder,
      // işletmenin kendi kanalından geleni tesiste tahsil eder.
      const online = source === 'rastla' || source === 'link';

      const total = quote({
        basePrice: Number(slot.price_try),
        rules: rulesByActivity.get(slot.activity_id) ?? [],
        discounts: discountsByActivity.get(slot.activity_id) ?? [],
        date: slot.slot_date,
        time: slot.slot_time,
        people,
      }).total;

      const bookingId = randomUUID();
      const stamp = new Date().toISOString();

      bookingRows.push([
        bookingId,
        generateCode(),
        guestIds.get(guest.phone),
        slot.slug,
        OPERATOR,
        slot.id,
        perPerson ? people : 1,
        0,
        source,
        online ? 'online' : 'onsite',
        slot.slot_date,
        slot.slot_time,
        people,
        0,
        total,
        past ? 'redeemed' : 'confirmed',
        stamp,
        stamp,
        redeemedAt,
        past ? 'demo-personel' : null,
        past ? people : null,
        null,
        null,
      ]);

      // Online ödenenlerde ödeme ve hak ediş kaydı da doğuyor — Hak Ediş
      // ekranının bakiyesi buradan geliyor. Tesiste ödenenlerde ikisi de YOK:
      // o parayı işletme kendisi tahsil ediyor, RASTLA'nın aktaracağı bir
      // şey yok.
      if (online && total > 0) {
        const paymentId = randomUUID();
        const commission = Math.floor((total * DEFAULT_COMMISSION_BP) / 10000);
        const ref = `demo-${bookingId.slice(0, 8)}`;

        paymentRows.push([
          paymentId, bookingId, 'demo', ref, bookingId, total, commission, 'TRY',
          'succeeded', `${ref}-item`, 'Test Kart', '4242', stamp, stamp,
        ]);

        // Bilet okutulduysa pay SERBEST, okutulmadıysa BLOKE. Hizmet
        // verilmeden serbest bırakmak, gelmeyen müşterinin parasını da
        // aktarmak olurdu.
        payoutRows.push([
          randomUUID(), bookingId, paymentId, OPERATOR, total, commission, 0,
          total - commission, past ? 'released' : 'held', `${ref}-item`, stamp,
          past ? redeemedAt : null,
        ]);
      }

      created++;
    }
  }

  try {
    await insertMany('bookings', BOOKING_COLUMNS, bookingRows);
    await insertMany('payments', PAYMENT_COLUMNS, paymentRows);
    await insertMany('payouts', PAYOUT_COLUMNS, payoutRows);
  } catch (error) {
    // Tutulan yer geri bırakılıyor: bırakılmasaydı bu öbeğin slotları dolu
    // görünür, karşılığında hiçbir rezervasyon olmazdı — betiğin çözmek
    // için var olduğu tutarsızlığın ta kendisi.
    await release(reservations);
    console.error(`\nYazma başarısız; ${reservations.length} slotun yeri geri bırakıldı.`);
    throw error;
  }
}

// -------------------------------------------------------------- iptaller
//
// Birkaç iptal kaydı ekleniyor ve bunlar **kapasite tüketmiyor** — uygulama
// iptalde yeri geri veriyor, dolayısıyla iptal edilmiş bir kayıt slotu dolu
// göstermemeli. Rezervasyonlar ekranının iptal rozetini ve hava iptali
// gerekçesini ancak böyle bir kayıt görünür kılıyor.

const cancelRows = [];
const cancelCount = Math.max(2, Math.round(created * 0.05));

for (let i = 0; i < cancelCount; i++) {
  const slot = slots[Math.floor(random() * slots.length)];
  const guest = nextGuest();
  const people = pick([1, 2, 2, 3]);
  const stamp = new Date().toISOString();

  const total = quote({
    basePrice: Number(slot.price_try),
    rules: rulesByActivity.get(slot.activity_id) ?? [],
    discounts: discountsByActivity.get(slot.activity_id) ?? [],
    date: slot.slot_date,
    time: slot.slot_time,
    people,
  }).total;

  cancelRows.push([
    randomUUID(),
    generateCode(),
    guestIds.get(guest.phone),
    slot.slug,
    OPERATOR,
    slot.id,
    slot.capacity_mode === 'per_person' ? people : 1,
    0,
    pick(SOURCES),
    'onsite',
    slot.slot_date,
    slot.slot_time,
    people,
    0,
    total,
    'cancelled',
    stamp,
    stamp,
    null,
    null,
    null,
    stamp,
    pick(['customer', 'customer', 'weather', 'operator']),
  ]);
  cancelled++;
}

// İptaller kapasite tutmadığı için geri bırakılacak bir şey yok; ayrı
// yazılıyorlar.
await insertMany('bookings', BOOKING_COLUMNS, cancelRows);

// ----------------------------------------------------------------- rapor

const after = await db.get(
  `SELECT COALESCE(SUM(s.booked),0) AS dolu, COALESCE(SUM(s.capacity),0) AS kapasite
     FROM slots s JOIN activities a ON a.id = s.activity_id
    WHERE a.operator_id = ? AND s.status = 'open' AND s.slot_date BETWEEN ? AND ?`,
  [OPERATOR, FROM, TO]
);

const summary = await db.get(
  `SELECT COUNT(*) AS n, COALESCE(SUM(total_try),0) AS ciro
     FROM bookings
    WHERE operator_id = ? AND booking_date BETWEEN ? AND ? AND status <> 'cancelled'`,
  [OPERATOR, FROM, TO]
);

const held = await db.get(
  `SELECT COALESCE(SUM(net_try),0) AS tutar FROM payouts
    WHERE operator_id = ? AND status = 'held'`,
  [OPERATOR]
);
const released = await db.get(
  `SELECT COALESCE(SUM(net_try),0) AS tutar FROM payouts
    WHERE operator_id = ? AND status = 'released'`,
  [OPERATOR]
);

const ratio = (Number(after.dolu) / Number(after.kapasite)) * 100;

console.log(`${created} rezervasyon + ${cancelled} iptal kaydı oluşturuldu.`);
if (skipped > 0) console.log(`${skipped} deneme yer olmadığı için atlandı.`);
console.log(`\nDoluluk: ${after.dolu}/${after.kapasite} (%${ratio.toFixed(1)})`);
console.log(`Ciro (${FROM} → ${TO}): ${summary.ciro} TL · ${summary.n} rezervasyon`);
console.log(`Hak ediş — bekleyen: ${held.tutar} TL · serbest: ${released.tutar} TL`);
console.log(`\nGeri almak için: node scripts/demo-gun.mjs --temizle`);

if (db.close) await db.close();
