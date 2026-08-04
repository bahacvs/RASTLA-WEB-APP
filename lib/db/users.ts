import { randomUUID } from 'node:crypto';
import { db } from './index';

export type User = { id: string; name: string; phone: string; createdAt: string };

type Row = { id: string; name: string; phone: string; created_at: string };

/** Telefon numarasını tek biçime indirger; aynı kişi iki kayıt oluşturmasın. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('90')) return digits;
  if (digits.startsWith('0')) return `90${digits.slice(1)}`;
  if (digits.length === 10) return `90${digits}`;
  return digits;
}

export function findOrCreateUser(name: string, phone: string): User {
  const normalized = normalizePhone(phone);

  const existing = db().prepare('SELECT * FROM users WHERE phone = ?').get(normalized) as
    | Row
    | undefined;

  if (existing) {
    // Ad, kaydın kimliği değil; kimlik telefondur. Aynı numaradan gelen yeni
    // bir rezervasyonda farklı bir ad yazılmışsa güncellenir — yoksa işletme
    // misafiri karşılarken ekranda eski adı görür. (Yazım düzeltmesi ya da
    // aynı hattan rezervasyon yapan bir aile üyesi.)
    const name_ = name.trim();
    if (name_.length > 0 && name_ !== existing.name) {
      db().prepare('UPDATE users SET name = ? WHERE id = ?').run(name_, existing.id);
      existing.name = name_;
    }

    return {
      id: existing.id,
      name: existing.name,
      phone: existing.phone,
      createdAt: existing.created_at,
    };
  }

  const row: Row = {
    id: randomUUID(),
    name: name.trim(),
    phone: normalized,
    created_at: new Date().toISOString(),
  };

  db()
    .prepare('INSERT INTO users (id, name, phone, created_at) VALUES (@id, @name, @phone, @created_at)')
    .run(row);

  return { id: row.id, name: row.name, phone: row.phone, createdAt: row.created_at };
}

export function getUser(id: string): User | null {
  const row = db().prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
  return row
    ? { id: row.id, name: row.name, phone: row.phone, createdAt: row.created_at }
    : null;
}
