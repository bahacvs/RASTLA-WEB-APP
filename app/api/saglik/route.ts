import { db, toCount, usingPostgres } from '@/lib/db/index.mjs';
import { IS_DEMO } from '@/lib/demo';

/**
 * Dağıtım sağlık ucu.
 *
 * Var olma sebebi somut: bir dağıtımda ana sayfa açılıp veritabanına dokunan
 * her sayfa 500 verdiğinde, dışarıdan bakan biri bunun hangi katmandan
 * geldiğini göremiyor — ortam değişkeni mi eksik, bağlantı mı kurulamıyor,
 * yoksa şema mı yok? Üçü de aynı boş 500 sayfasını üretiyor. Bu uç, tek
 * istekte hangisi olduğunu söylüyor.
 *
 * **Hiçbir sır dönmez.** Bağlantı dizgisi, sunucu adı, kullanıcı adı ve hata
 * metni dışarı verilmez; hata yalnızca sınıf adı ve sürücü kodu olarak
 * özetlenir (`ECONNREFUSED`, `28P01` gibi). Tam hata sunucu günlüğüne yazılır.
 * Sebep: bağlantı hataları çoğu zaman ana makine adını metnin içinde taşır ve
 * bu ucun kimlik doğrulaması yok.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  const veritabani: { erisilebilir: boolean; aktivite?: number; hata?: string } = {
    erisilebilir: false,
  };

  try {
    const client = await db();
    const row = await client.get<{ n: unknown }>('SELECT COUNT(*) AS n FROM activities');
    veritabani.erisilebilir = true;
    veritabani.aktivite = toCount(row?.n);
  } catch (error) {
    console.error('[saglik] veritabanına ulaşılamadı:', error);
    veritabani.hata = ozetle(error);
  }

  return Response.json(
    {
      ok: veritabani.erisilebilir,
      motor: usingPostgres ? 'postgres' : 'sqlite',
      demo: IS_DEMO,
      veritabani,
    },
    {
      status: veritabani.erisilebilir ? 200 : 503,
      // Sağlık cevabı asla önbelleğe girmemeli; eski bir "ok" en yanıltıcısı.
      headers: { 'cache-control': 'no-store' },
    }
  );
}

/**
 * Hatayı sızdırmayan bir etikete indirger.
 *
 * Yalnızca sınıf adı ve — varsa — sürücünün kısa kodu. Serbest metin
 * alınmıyor: `pg` hataları ana makine adını ve portu metne gömüyor.
 */
function ozetle(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? `${name} (${code})` : name;
}
