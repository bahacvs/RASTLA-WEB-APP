/**
 * Fiyat hesabı — **tek kaynak.**
 *
 * Bu dosya açılmadan önce hesap BEŞ yerde kopyaydı: rezervasyon ekranı,
 * müşteri rezervasyon eylemi, manuel kayıt, acente rezervasyonu ve tanıtım
 * betiği. Hepsi `kişi × fiyat` yazıyordu ve fiyat kuralları eklenirken beşini
 * birden güncellemek gerekecekti; biri unutulsaydı müşteriye gösterilen tutar
 * ile tahsil edilen tutar birbirinden ayrılırdı — bu projedeki en pahalı hata
 * türü (bkz. hazırlık payında yaşananın aynısı).
 *
 * Saf: veritabanı yok, `process` yok, ağ yok. Sunucu eylemi de rezervasyon
 * ekranındaki istemci bileşeni de aynı fonksiyonu çağırıyor, dolayısıyla
 * ekranda yazan tutar ile sunucunun hesapladığı tutar aynı koddan geliyor.
 * Yine de **sunucu her zaman yeniden hesaplıyor**: istemciden gelen tutara
 * güvenilmez.
 *
 * Düz ESM (.mjs): `demo-gun.mjs` gibi düğüm betikleri de çağırıyor ve onlar
 * TypeScript modülü yükleyemiyor — `lib/schedule-times.mjs` ile aynı gerekçe.
 *
 * PARA TAM SAYI. Tutarlar TL cinsinden tam sayı tutuluyor (şemadaki
 * `price_try INTEGER`); kayan noktayla hesaplanan bir kuruş, mutabakatta
 * açıklanamayan bir fark demek.
 *
 * @typedef {Object} PriceRule
 * @property {string} id
 * @property {string} label
 * @property {number} priority        Büyük olan önce bakılır.
 * @property {string|null} validFrom  YYYY-MM-DD, dahil
 * @property {string|null} validUntil YYYY-MM-DD, dahil
 * @property {number} weekdays        7 bitlik maske; bit 0 = Pazartesi
 * @property {string|null} startTime  HH:MM, dahil
 * @property {string|null} endTime    HH:MM, hariç
 * @property {number} priceTRY
 *
 * @typedef {Object} GroupDiscount
 * @property {number} minPeople
 * @property {number} percent
 *
 * @typedef {Object} Quote
 * @property {number} unitPrice        Kişi başı fiyat (kural uygulanmış)
 * @property {string|null} ruleLabel   Fiyatı belirleyen kural; yoksa null
 * @property {number} people
 * @property {number} subtotal         unitPrice × people
 * @property {number} discountPercent  Uygulanan grup indirimi yüzdesi
 * @property {number} discountTRY
 * @property {number} total            Ödenecek tutar
 */

/**
 * Tarihin haftanın hangi gününe denk geldiği — bit 0 = Pazartesi.
 *
 * `Date.getDay()` Pazar'ı 0 kabul ediyor; şemadaki maske Pazartesi'yi 0
 * kabul ediyor (schedule_rules ile aynı düzen). Dönüşüm burada tek yerde
 * yapılıyor.
 *
 * @param {string} date YYYY-MM-DD
 * @returns {number} 0–6, Pazartesi = 0
 */
export function weekdayIndex(date) {
  // Saat dilimi kaymasını önlemek için UTC olarak okunuyor: yerel saatte
  // `new Date('2026-07-01')` bazı dilimlerde bir önceki güne düşüyor ve
  // cumartesi tarifesi cumaya kayardı.
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

/**
 * Kural bu tarih ve saate uyuyor mu.
 *
 * @param {PriceRule} rule
 * @param {string} date  YYYY-MM-DD
 * @param {string} time  HH:MM
 * @returns {boolean}
 */
export function ruleMatches(rule, date, time) {
  if (rule.validFrom && date < rule.validFrom) return false;
  if (rule.validUntil && date > rule.validUntil) return false;

  if (((rule.weekdays >> weekdayIndex(date)) & 1) === 0) return false;

  // Saat karşılaştırması dizgi olarak yapılıyor: "09:30" < "14:00" sözlük
  // sırasında da doğru, çünkü biçim sabit genişlikte. Dakikaya çevirmek ek
  // bir dönüşüm ve ek bir hata yeri olurdu.
  if (rule.startTime && time < rule.startTime) return false;
  if (rule.endTime && time >= rule.endTime) return false;

  return true;
}

/**
 * Kişi başı fiyatı belirler.
 *
 * Kurallar sıralı taranıyor ve **ilk eşleşen kazanıyor**. "En özgül kural
 * kazanır" gibi örtük bir seçim daha akıllı görünürdü ama işletme hangi
 * fiyatın neden çıktığını göremezdi.
 *
 * @param {number} basePrice          `activities.price_try`
 * @param {PriceRule[]} rules         Sıralı olması ŞART (bkz. sortRules)
 * @param {{ date: string, time: string }} when
 * @returns {{ price: number, label: string|null }}
 */
export function unitPriceFor(basePrice, rules, when) {
  for (const rule of rules) {
    if (ruleMatches(rule, when.date, when.time)) {
      return { price: rule.priceTRY, label: rule.label };
    }
  }
  return { price: basePrice, label: null };
}

/**
 * Kuralları değerlendirme sırasına dizer: önce yüksek öncelik, sonra eskiler.
 *
 * Sıralama HESAPTAN AYRI durmalı ki hem veritabanından gelen liste hem de
 * ekranda kullanıcıya gösterilen liste aynı sırada olsun; iki farklı sıra,
 * "ekranda üstteki kural geçerli" beklentisini boşa çıkarırdı.
 *
 * @param {(PriceRule & { createdAt?: string })[]} rules
 * @returns {PriceRule[]}
 */
export function sortRules(rules) {
  return [...rules].sort(
    (a, b) => b.priority - a.priority || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
  );
}

/**
 * Kişi sayısına uyan grup indirimi.
 *
 * Kişi sayısının GEÇTİĞİ en yüksek eşik uygulanıyor ve yalnızca biri: üst
 * üste binen indirimler işletmenin kafadan hesaplayamayacağı bir toplam
 * üretirdi.
 *
 * @param {GroupDiscount[]} discounts
 * @param {number} people
 * @returns {number} yüzde; indirim yoksa 0
 */
export function discountFor(discounts, people) {
  let percent = 0;
  let threshold = 0;

  for (const d of discounts) {
    if (people >= d.minPeople && d.minPeople >= threshold) {
      threshold = d.minPeople;
      percent = d.percent;
    }
  }
  return percent;
}

/**
 * Tam teklif: kişi başı fiyat, ara toplam, indirim ve ödenecek tutar.
 *
 * İndirim tutarı **yukarı yuvarlanıyor** (`ceil`): yuvarlama farkı müşterinin
 * lehine kalsın. Aşağı yuvarlansaydı fark her seferinde işletmenin lehine
 * olurdu ve bir liralık bir fazlalık, güveni bir liradan pahalıya mal olur.
 *
 * @param {{
 *   basePrice: number,
 *   rules?: PriceRule[],
 *   discounts?: GroupDiscount[],
 *   date: string,
 *   time: string,
 *   people: number,
 * }} input
 * @returns {Quote}
 */
export function quote(input) {
  const people = Math.max(0, Math.trunc(input.people));
  const { price, label } = unitPriceFor(input.basePrice, sortRules(input.rules ?? []), {
    date: input.date,
    time: input.time,
  });

  const subtotal = price * people;
  const discountPercent = discountFor(input.discounts ?? [], people);
  const discountTRY = Math.ceil((subtotal * discountPercent) / 100);

  return {
    unitPrice: price,
    ruleLabel: label,
    people,
    subtotal,
    discountPercent,
    discountTRY,
    total: subtotal - discountTRY,
  };
}
