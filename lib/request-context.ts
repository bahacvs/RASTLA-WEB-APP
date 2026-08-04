import { headers } from 'next/headers';

/**
 * İşlem günlüğüne yazılacak istek bilgisi.
 *
 * IP adresi ve tarayıcı bilgisi **kişisel veridir**; yalnızca güvenlik amacıyla
 * ve sınırlı süreyle tutulur (bkz. legal/veri-saklama-imha-politikasi.md ve
 * aydınlatma metni). Bu yüzden tek bir yerden okunur: hangi alanların
 * kaydedildiği tek bir dosyadan görülebilsin.
 */

export type RequestContext = { ip: string | null; userAgent: string | null };

/**
 * Vercel gibi bir ters vekil arkasında gerçek istemci adresi
 * `x-forwarded-for` başlığının İLK değeridir; sonrakiler ara vekillerdir.
 *
 * DİKKAT: bu başlık istemci tarafından uydurulabilir. Vekil arkasında değilken
 * güvenilmez. Burada yalnızca günlük ve hız sınırı için kullanılıyor;
 * yetkilendirme kararı hiçbir zaman IP'ye dayandırılmaz.
 */
export async function requestContext(): Promise<RequestContext> {
  const h = await headers();

  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded
    ? (forwarded.split(',')[0]?.trim() ?? null)
    : h.get('x-real-ip');

  return { ip: ip || null, userAgent: h.get('user-agent') };
}
