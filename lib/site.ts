/**
 * Sitenin genel adresi. Sitemap, robots ve mutlak URL gerektiren meta
 * etiketleri (Open Graph) bunu kullanır.
 *
 * Vercel'de `NEXT_PUBLIC_SITE_URL` tanımlı değilse dağıtımın kendi adresine
 * (`VERCEL_PROJECT_PRODUCTION_URL`) düşer; yerelde localhost'a.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (explicit) return explicit;

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}

export const SITE_URL = resolveSiteUrl();

export const SITE_NAME = 'RASTLA';

export const SITE_DESCRIPTION =
  'RASTLA; su sporlarını ve yerel turistik aktiviteleri şeffaf fiyat, doğrulanmış işletme ve hızlı rezervasyon deneyimiyle bir araya getirir.';
