import { randomUUID } from 'node:crypto';
import { db } from './index.mjs';
// Göreli yol, `@/` takma adı değil: doğrulama betikleri bu modülü doğrudan
// node ile yüklüyor ve node takma adı çözemiyor. Tip içe aktarımları
// derlemede siliniyor, DEĞER içe aktarımı silinmiyor — bu satır o yüzden
// göreli olmak zorunda (bkz. lib/notify.mjs).
import { sortRules, type GroupDiscount, type PriceRule } from '../pricing.mjs';

/**
 * Fiyat kuralları ve grup indirimleri — **veritabanı tarafı.**
 *
 * Hesabın kendisi burada değil, `lib/pricing.mjs` içinde: o dosya saf ve
 * istemci tarafından da çağrılabiliyor. Bu dosya yalnızca satırları okuyup
 * yazıyor. Ayrım kasıtlı — hesap veritabanına bağlı olsaydı rezervasyon
 * ekranında gösterilen tutar ile sunucunun hesapladığı tutar iki ayrı koddan
 * gelirdi ve ayrışmaları an meselesiydi.
 *
 * `loadPricing` kuralları **sıralı** döndürüyor (`sortRules`): "ilk eşleşen
 * kazanır" kuralının anlamlı olması için sıranın hem ekranda hem hesapta aynı
 * olması gerekiyor.
 */

type RuleRow = {
  id: string;
  activity_id: string;
  label: string;
  priority: number | string;
  valid_from: string | null;
  valid_until: string | null;
  weekdays: number | string;
  start_time: string | null;
  end_time: string | null;
  price_try: number | string;
  created_at: string;
};

type DiscountRow = {
  id: string;
  activity_id: string;
  min_people: number | string;
  percent: number | string;
  created_at: string;
};

export type StoredPriceRule = PriceRule & { activityId: string; createdAt: string };
export type StoredGroupDiscount = GroupDiscount & {
  id: string;
  activityId: string;
  createdAt: string;
};

function toRule(row: RuleRow): StoredPriceRule {
  return {
    id: row.id,
    activityId: row.activity_id,
    label: row.label,
    // Postgres sürücüsü INTEGER'ı bazı tiplerde dizgi döndürüyor; hesap
    // sayıyla yapılıyor, dönüşüm tek yerde.
    priority: Number(row.priority),
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    weekdays: Number(row.weekdays),
    startTime: row.start_time,
    endTime: row.end_time,
    priceTRY: Number(row.price_try),
    createdAt: row.created_at,
  };
}

function toDiscount(row: DiscountRow): StoredGroupDiscount {
  return {
    id: row.id,
    activityId: row.activity_id,
    minPeople: Number(row.min_people),
    percent: Number(row.percent),
    createdAt: row.created_at,
  };
}

export async function listPriceRules(activityId: string): Promise<StoredPriceRule[]> {
  const rows = await (
    await db()
  ).all<RuleRow>('SELECT * FROM price_rules WHERE activity_id = ?', [activityId]);
  return sortRules(rows.map(toRule)) as StoredPriceRule[];
}

export async function listGroupDiscounts(activityId: string): Promise<StoredGroupDiscount[]> {
  const rows = await (
    await db()
  ).all<DiscountRow>(
    'SELECT * FROM group_discounts WHERE activity_id = ? ORDER BY min_people',
    [activityId]
  );
  return rows.map(toDiscount);
}

/**
 * Bir aktivitenin fiyatlandırmasının tamamı — **tek çağrı.**
 *
 * İki ayrı fonksiyon çağırmak zorunda bırakmak, çağıranın birini unutmasına
 * açık kapı bırakırdı: indirimsiz hesaplanmış bir tutar sessizce doğru görünür.
 */
export async function loadPricing(
  activityId: string
): Promise<{ rules: StoredPriceRule[]; discounts: StoredGroupDiscount[] }> {
  const [rules, discounts] = await Promise.all([
    listPriceRules(activityId),
    listGroupDiscounts(activityId),
  ]);
  return { rules, discounts };
}

export type PriceRuleInput = {
  activityId: string;
  label: string;
  priority: number;
  validFrom: string | null;
  validUntil: string | null;
  weekdays: number;
  startTime: string | null;
  endTime: string | null;
  priceTRY: number;
};

export async function createPriceRule(input: PriceRuleInput): Promise<string> {
  const id = randomUUID();
  await (
    await db()
  ).run(
    `INSERT INTO price_rules
       (id, activity_id, label, priority, valid_from, valid_until, weekdays,
        start_time, end_time, price_try, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.activityId,
      input.label,
      input.priority,
      input.validFrom,
      input.validUntil,
      input.weekdays,
      input.startTime,
      input.endTime,
      input.priceTRY,
      new Date().toISOString(),
    ]
  );
  return id;
}

/**
 * Kuralı siler. `activityId` şartı **yetki kontrolü**: id tahmin eden biri
 * başka bir işletmenin kuralını silememeli. Çağıran zaten aktivitenin
 * sahipliğini doğruluyor; bu, o doğrulamayı SQL'e taşıyan ikinci kilit.
 */
export async function deletePriceRule(id: string, activityId: string): Promise<boolean> {
  const result = await (
    await db()
  ).run('DELETE FROM price_rules WHERE id = ? AND activity_id = ?', [id, activityId]);
  return result.changes === 1;
}

/**
 * Grup indirimi ekler ya da var olan eşiği günceller.
 *
 * `ON CONFLICT` ile: işletme aynı eşiği ikinci kez girdiğinde hata görmek
 * yerine yüzdeyi değiştirmiş oluyor — istediği zaten buydu. Önce okuyup
 * "var mı" diye bakmak, iki sekmeden aynı anda kaydedende çakışırdı.
 */
export async function upsertGroupDiscount(input: {
  activityId: string;
  minPeople: number;
  percent: number;
}): Promise<void> {
  await (
    await db()
  ).run(
    `INSERT INTO group_discounts (id, activity_id, min_people, percent, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (activity_id, min_people) DO UPDATE SET percent = excluded.percent`,
    [randomUUID(), input.activityId, input.minPeople, input.percent, new Date().toISOString()]
  );
}

export async function deleteGroupDiscount(id: string, activityId: string): Promise<boolean> {
  const result = await (
    await db()
  ).run('DELETE FROM group_discounts WHERE id = ? AND activity_id = ?', [id, activityId]);
  return result.changes === 1;
}
