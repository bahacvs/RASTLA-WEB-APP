import { randomUUID } from 'node:crypto';
import { db } from './index.mjs';

/**
 * Müsaitlik motoru.
 *
 * Kurallar (schedule_rules) tek gerçek kaynaktır; slotlar onlardan üretilir.
 * Kapasite slota üretim anında kopyalanır, böylece kural sonradan değişse de
 * mevcut rezervasyonların dayandığı kapasite geriye dönük bozulmaz.
 */

export type ScheduleRule = {
  id: string;
  activityId: string;
  /** 7 bitlik maske. Bit 0 = Pazartesi … bit 6 = Pazar. 127 = her gün. */
  weekdays: number;
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  capacity: number;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
};

export type Slot = {
  id: string;
  activityId: string;
  ruleId: string | null;
  date: string;
  time: string;
  capacity: number;
  booked: number;
  status: 'open' | 'closed';
  /** Kalan yer. Kapalı slotta 0. */
  remaining: number;
};

type RuleRow = {
  id: string;
  activity_id: string;
  weekdays: number;
  start_time: string;
  end_time: string;
  interval_minutes: number;
  capacity: number;
  valid_from: string;
  valid_until: string | null;
  active: number;
};

type SlotRow = {
  id: string;
  activity_id: string;
  rule_id: string | null;
  slot_date: string;
  slot_time: string;
  capacity: number;
  booked: number;
  status: 'open' | 'closed';
};

function toRule(row: RuleRow): ScheduleRule {
  return {
    id: row.id,
    activityId: row.activity_id,
    weekdays: row.weekdays,
    startTime: row.start_time,
    endTime: row.end_time,
    intervalMinutes: row.interval_minutes,
    capacity: row.capacity,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    active: row.active === 1,
  };
}

function toSlot(row: SlotRow): Slot {
  return {
    id: row.id,
    activityId: row.activity_id,
    ruleId: row.rule_id,
    date: row.slot_date,
    time: row.slot_time,
    capacity: row.capacity,
    booked: row.booked,
    status: row.status,
    remaining: row.status === 'open' ? Math.max(0, row.capacity - row.booked) : 0,
  };
}

// ---------------------------------------------------------------- yardımcılar

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function toTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/** Pazartesi = 0 olacak biçimde haftanın günü. JS'te 0 = Pazar olduğu için kaydırılır. */
function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Kuralın bir gün için ürettiği saatler.
 * start_time dahil, end_time hariç: 08:00–18:00 / 15 dk => 40 saat (08:00 … 17:45).
 */
export function timesForRule(rule: Pick<ScheduleRule, 'startTime' | 'endTime' | 'intervalMinutes'>): string[] {
  const start = toMinutes(rule.startTime);
  const end = toMinutes(rule.endTime);
  const times: string[] = [];

  for (let m = start; m < end; m += rule.intervalMinutes) times.push(toTime(m));
  return times;
}

// ------------------------------------------------------------------- kurallar

export async function createRule(
  input: Omit<ScheduleRule, 'id' | 'active'> & { active?: boolean }
): Promise<ScheduleRule> {
  const row: RuleRow = {
    id: randomUUID(),
    activity_id: input.activityId,
    weekdays: input.weekdays,
    start_time: input.startTime,
    end_time: input.endTime,
    interval_minutes: input.intervalMinutes,
    capacity: input.capacity,
    valid_from: input.validFrom,
    valid_until: input.validUntil,
    active: input.active === false ? 0 : 1,
  };

  await (
    await db()
  ).run(
    `INSERT INTO schedule_rules
       (id, activity_id, weekdays, start_time, end_time, interval_minutes,
        capacity, valid_from, valid_until, active, created_at)
     VALUES
       (@id, @activity_id, @weekdays, @start_time, @end_time, @interval_minutes,
        @capacity, @valid_from, @valid_until, @active, @created_at)`,
    { ...row, created_at: new Date().toISOString() }
  );

  return toRule(row);
}

export async function listRules(activityId: string): Promise<ScheduleRule[]> {
  const rows = await (
    await db()
  ).all<RuleRow>('SELECT * FROM schedule_rules WHERE activity_id = ? ORDER BY start_time', [
    activityId,
  ]);
  return rows.map(toRule);
}

export async function setRuleActive(ruleId: string, active: boolean) {
  await (
    await db()
  ).run('UPDATE schedule_rules SET active = ? WHERE id = ?', [active ? 1 : 0, ruleId]);
}

// ------------------------------------------------------------- slot üretimi

/**
 * Kuralın kapsadığı günler için slot üretir.
 *
 * İdempotenttir: `ON CONFLICT DO NOTHING` sayesinde tekrar çalıştırmak kopya
 * oluşturmaz, mevcut slotların kapasitesini ya da doluluğunu değiştirmez.
 *
 * @returns eklenen slot sayısı
 */
export async function generateSlots(rule: ScheduleRule, horizonDays = 90): Promise<number> {
  if (!rule.active) return 0;

  const times = timesForRule(rule);
  if (times.length === 0) return 0;

  const client = await db();
  const INSERT = `INSERT INTO slots (id, activity_id, rule_id, slot_date, slot_time, capacity, booked, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'open', ?)
     ON CONFLICT (activity_id, slot_date, slot_time) DO NOTHING`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const from = new Date(`${rule.validFrom}T00:00:00`);
  const cursor = from > today ? from : today;

  const horizonEnd = new Date(today);
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);
  const until = rule.validUntil ? new Date(`${rule.validUntil}T00:00:00`) : horizonEnd;
  const end = until < horizonEnd ? until : horizonEnd;

  const now = new Date().toISOString();
  let added = 0;

  for (const day = new Date(cursor); day <= end; day.setDate(day.getDate() + 1)) {
    // Kuralın kapsamadığı günleri atla.
    if ((rule.weekdays & (1 << weekdayIndex(day))) === 0) continue;

    const date = toIsoDate(day);
    for (const time of times) {
      const result = await client.run(INSERT, [
        randomUUID(),
        rule.activityId,
        rule.id,
        date,
        time,
        rule.capacity,
        now,
      ]);
      added += result.changes;
    }
  }

  return added;
}

/**
 * Kural değiştikten sonra slotları eşitler.
 *
 * Eksik slotlar eklenir. Artık hiçbir aktif kurala uymayan slotlardan
 * **rezervasyonu olmayanlar** kapatılır; rezervasyonu olanlar korunur ve
 * çağırana bildirilir — dolu bir slotu sessizce silmek veri kaybıdır.
 */
export async function syncSlots(
  activityId: string,
  horizonDays = 90
): Promise<{ added: number; closed: number; keptWithBookings: Slot[] }> {
  const client = await db();
  const rules = (await listRules(activityId)).filter((r) => r.active);

  let added = 0;
  for (const rule of rules) added += await generateSlots(rule, horizonDays);

  // Aktif kuralların kapsadığı (tarih, saat) çiftleri.
  const covered = new Set<string>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const rule of rules) {
    const times = timesForRule(rule);
    const horizonEnd = new Date(today);
    horizonEnd.setDate(horizonEnd.getDate() + horizonDays);

    const from = new Date(`${rule.validFrom}T00:00:00`);
    const cursor = from > today ? from : today;
    const until = rule.validUntil ? new Date(`${rule.validUntil}T00:00:00`) : horizonEnd;
    const end = until < horizonEnd ? until : horizonEnd;

    for (const day = new Date(cursor); day <= end; day.setDate(day.getDate() + 1)) {
      if ((rule.weekdays & (1 << weekdayIndex(day))) === 0) continue;
      const date = toIsoDate(day);
      for (const time of times) covered.add(`${date} ${time}`);
    }
  }

  const future = await client.all<SlotRow>(
    `SELECT * FROM slots WHERE activity_id = ? AND slot_date >= ?`,
    [activityId, toIsoDate(today)]
  );

  const keptWithBookings: Slot[] = [];
  let closed = 0;

  for (const row of future) {
    if (covered.has(`${row.slot_date} ${row.slot_time}`)) continue;

    if (row.booked > 0) {
      keptWithBookings.push(toSlot(row));
      continue;
    }
    if (row.status === 'open') {
      await client.run(`UPDATE slots SET status = 'closed' WHERE id = ?`, [row.id]);
      closed++;
    }
  }

  return { added, closed, keptWithBookings };
}

// --------------------------------------------------------------- sorgulama

export async function listSlots(activityId: string, date: string): Promise<Slot[]> {
  const rows = await (
    await db()
  ).all<SlotRow>('SELECT * FROM slots WHERE activity_id = ? AND slot_date = ? ORDER BY slot_time', [
    activityId,
    date,
  ]);
  return rows.map(toSlot);
}

export async function getSlot(id: string): Promise<Slot | null> {
  const row = await (await db()).get<SlotRow>('SELECT * FROM slots WHERE id = ?', [id]);
  return row ? toSlot(row) : null;
}

/** Müsait yeri olan günler — takvimde hangi günün seçilebilir olduğunu belirler. */
export async function datesWithAvailability(
  activityId: string,
  from: string,
  to: string
): Promise<string[]> {
  const rows = await (
    await db()
  ).all<{ slot_date: string }>(
    `SELECT DISTINCT slot_date FROM slots
      WHERE activity_id = ? AND slot_date BETWEEN ? AND ?
        AND status = 'open' AND booked < capacity
      ORDER BY slot_date`,
    [activityId, from, to]
  );
  return rows.map((r) => r.slot_date);
}

export async function setSlotStatus(slotId: string, status: 'open' | 'closed') {
  await (await db()).run('UPDATE slots SET status = ? WHERE id = ?', [status, slotId]);
}

// ------------------------------------------------------------ kapasite

export type ReserveResult =
  | { ok: true; slot: Slot }
  | { ok: false; reason: 'not_found' | 'closed' | 'full' };

/**
 * Slottan kapasite düşer. Aşırı rezervasyona kapalıdır.
 *
 * Garanti tek bir koşullu UPDATE'e dayanır — bilet onayındaki desenin aynısı:
 *
 *   UPDATE slots SET booked = booked + :units
 *    WHERE id = :id AND status = 'open' AND booked + :units <= capacity
 *
 * Bu ifade atomiktir. Son yeri iki kişi aynı anda almaya çalıştığında
 * güncellemeler sıraya girer; ilki kapasiteyi tüketir, ikincisinin WHERE
 * koşulu artık tutmaz ve 0 satır etkiler. Hiçbir yerde "önce say, uygun mu
 * bak, sonra ekle" yapılmaz — o yaklaşım yarış durumuna açıktır.
 */
export async function reserveCapacity(slotId: string, units: number): Promise<ReserveResult> {
  const result = await (
    await db()
  ).run(
    `UPDATE slots
        SET booked = booked + ?
      WHERE id = ? AND status = 'open' AND booked + ? <= capacity`,
    [units, slotId, units]
  );

  if (result.changes === 1) return { ok: true, slot: (await getSlot(slotId))! };

  const slot = await getSlot(slotId);
  if (!slot) return { ok: false, reason: 'not_found' };
  if (slot.status === 'closed') return { ok: false, reason: 'closed' };
  return { ok: false, reason: 'full' };
}

/** İptalde kapasiteyi geri verir. Negatife düşmesi şema kısıtıyla da engellenir. */
export async function releaseCapacity(slotId: string, units: number) {
  await (
    await db()
  ).run('UPDATE slots SET booked = booked - ? WHERE id = ? AND booked >= ?', [
    units,
    slotId,
    units,
  ]);
}
