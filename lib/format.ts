/**
 * Fiyatları prototipteki biçimde yazar: binlik ayracı nokta, sonda "TL".
 * Örn. 1200 -> "1.200 TL"
 */
export function formatPrice(value: number): string {
  return `${new Intl.NumberFormat('tr-TR').format(value)} TL`;
}
