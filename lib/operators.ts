import { timingSafeEqual } from 'node:crypto';

/**
 * Pilot dönemin işletme tanımları.
 *
 * Erişim kodları `OPERATOR_ACCESS_CODES` ortam değişkeninden okunur:
 *   OPERATOR_ACCESS_CODES=buyukcekmece-wsc:1234,mimarsinan-marina:5678
 *
 * Bu pilot seviyesinde bir çözümdür: paylaşılan bir koddur, kişi bazında
 * hesap yoktur. Üretimde işletme kullanıcıları ve düzgün kimlik doğrulama
 * gerekir — bkz. README.
 */

export type Operator = { id: string; name: string };

export const OPERATORS: Operator[] = [
  { id: 'buyukcekmece-wsc', name: 'Büyükçekmece Water Sports Center' },
  { id: 'mimarsinan-marina', name: 'Mimarsinan Marina Deniz Sporları' },
];

export function getOperator(id: string): Operator | undefined {
  return OPERATORS.find((o) => o.id === id);
}

function accessCodes(): Map<string, string> {
  const raw = process.env.OPERATOR_ACCESS_CODES ?? '';
  const map = new Map<string, string>();

  for (const pair of raw.split(',')) {
    const [id, code] = pair.split(':').map((s) => s?.trim());
    if (id && code) map.set(id, code);
  }
  return map;
}

export function isOperatorLoginEnabled(): boolean {
  return accessCodes().size > 0;
}

/** Koda karşılık gelen işletmeyi döner. Kod eşleşmezse null. */
export function authenticateOperator(operatorId: string, code: string): Operator | null {
  const expected = accessCodes().get(operatorId);
  if (!expected) return null;

  const a = Buffer.from(code);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return getOperator(operatorId) ?? null;
}
