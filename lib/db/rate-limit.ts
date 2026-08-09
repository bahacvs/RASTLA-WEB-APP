import { db } from './index.mjs';

/**
 * Hız sınırı.
 *
 * Korunan üç yer var ve üçünün sebebi farklı:
 *
 *   1. **İşletme girişi** — kaba kuvvet. Hem IP hem e-posta bazında sayılır:
 *      yalnızca IP sayılsaydı saldırgan adres değiştirir, yalnızca e-posta
 *      sayılsaydı hesap listesi üzerinde gezinirdi.
 *   2. **Bilet onayı denemeleri** — kod sondajı. Kodlar 160 bit rastgele
 *      olduğu için tahmin pratikte imkânsız; sınır, sonuçsuz denemelerin
 *      sistemi meşgul etmesini ve günlüğü şişirmesini engeller.
 *   3. **Rezervasyon oluşturma** — kötüye kullanım. Sınırsız olsaydı bir kişi
 *      bir işletmenin tüm gününü doldurup gelmeyebilirdi.
 *
 * Deseni proje boyunca kullanılan desenle aynı: karar **tek bir koşullu SQL
 * ifadesinde** verilir. "Önce say, sonra artır" yapılsaydı iki eşzamanlı istek
 * aynı sayıyı okuyup ikisi de geçebilirdi — sınır tam da yük altında, yani
 * gerektiği anda delinirdi.
 */

export type LimitRule = {
  /** Pencere içinde izin verilen deneme sayısı. */
  limit: number;
  /** Pencere uzunluğu, saniye. */
  windowSeconds: number;
};

export const LIMITS = {
  /**
   * Aynı e-postaya **başarısız** giriş: 15 dakikada 5.
   *
   * Sayılan şey başarısızlıktır, deneme değil. Başarılı girişler
   * sınırlanmaz: günde yirmi kez giren bir personel saldırgan değildir ve
   * onu engellemek yalnızca işini durdururdu. Kaba kuvvetin tanımı ise
   * arka arkaya BAŞARISIZ denemedir; ondan kaçış yok.
   */
  loginByEmail: { limit: 5, windowSeconds: 15 * 60 },

  /**
   * Aynı IP'den başarısız giriş: 15 dakikada 20.
   *
   * E-posta kovasından gevşek, çünkü asıl savunma orada. Bu kova
   * e-posta gezerek arama yapan saldırgana karşı ek bir nettir; CGNAT
   * yüzünden birçok meşru kullanıcı da aynı IP'yi paylaşabileceği için
   * bilinçli olarak geniş tutuldu.
   */
  loginByIp: { limit: 20, windowSeconds: 15 * 60 },
  /** Bir personelin başarısız bilet onayı denemesi: 5 dakikada 20. */
  redeemFailures: { limit: 20, windowSeconds: 5 * 60 },

  /**
   * Aynı numaradan rezervasyon: saatte 8. Asıl sınır budur — telefon
   * numarası müşterinin kimliğidir. Bir grup için arka arkaya birkaç
   * rezervasyon yapmak normaldir, sekiz tanesi değil.
   */
  bookingByPhone: { limit: 8, windowSeconds: 60 * 60 },

  /**
   * Aynı IP'den rezervasyon: saatte 40. Bilinçli olarak yüksek.
   *
   * Türkiye'de mobil operatörler CGNAT kullanır: yüzlerce kullanıcı tek bir
   * genel IP'nin arkasından çıkar. Otel ve plaj wifi'leri de aynı durumda.
   * Sıkı bir IP sınırı, yaz gününde aynı sahildeki müşterilerin birbirini
   * engellemesi anlamına gelirdi. Bu yüzden IP yalnızca **betikle yapılan**
   * kötüye kullanıma karşı geniş bir emniyet ağıdır; gerçek sınır numarada.
   */
  bookingByIp: { limit: 40, windowSeconds: 60 * 60 },

  /**
   * Aynı numaraya doğrulama kodu gönderimi: saatte 5.
   *
   * İki şeyi birden korur. Birincisi kullanıcının cebi: SMS ücretlidir ve
   * sınırsız gönderim, numarayı bilen birinin başkasına bedel yükleyip
   * telefonunu yağdırmasına izin verirdi. İkincisi deneme havuzu: sınır
   * olmasaydı saldırgan sürekli yeni kod isteyip "kod başına 5 deneme"
   * sınırını istediği kadar çoğaltabilirdi.
   */
  otpByPhone: { limit: 5, windowSeconds: 60 * 60 },

  /**
   * Aynı IP'den işletme başvurusu: saatte 3.
   *
   * Başvuru her seferinde bir işletme VE bir hesap yaratıyor; sınırsız
   * bırakılsaydı tek bir betik operatör tablosunu doldurup /yonetim'deki
   * inceleme kuyruğunu kullanılamaz hâle getirirdi — ve o kuyruk, doğrulama
   * rozetinin arkasındaki tek insan kontrolü.
   *
   * Üç, gerçek bir kullanıcıyı zorlamıyor: kimse saatte üç işletme açmıyor.
   */
  operatorSignupByIp: { limit: 3, windowSeconds: 60 * 60 },

  /** Aynı IP'den kod isteme: saatte 30. CGNAT yüzünden geniş (bkz. yukarısı). */
  otpByIp: { limit: 30, windowSeconds: 60 * 60 },
} as const satisfies Record<string, LimitRule>;

export type LimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Bir denemeyi sayar ve izin verilip verilmediğini döner.
 *
 * Tek bir UPSERT: pencere dolmuşsa sayaç sıfırlanır, dolmamışsa artırılır.
 * `RETURNING` hem SQLite 3.35+ hem Postgres tarafından desteklenir.
 */
export async function consume(
  bucket: string,
  rule: LimitRule,
  now = new Date()
): Promise<LimitResult> {
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - rule.windowSeconds * 1000).toISOString();

  const row = await (
    await db()
  ).get<{ count: number; window_start: string }>(
    `INSERT INTO rate_limits (bucket, window_start, count)
          VALUES (@bucket, @now, 1)
     ON CONFLICT (bucket) DO UPDATE SET
          window_start = CASE WHEN rate_limits.window_start <= @cutoff
                              THEN @now ELSE rate_limits.window_start END,
          count        = CASE WHEN rate_limits.window_start <= @cutoff
                              THEN 1 ELSE rate_limits.count + 1 END
     RETURNING count, window_start`,
    { bucket, now: nowIso, cutoff }
  );

  if (!row) return { allowed: true, remaining: rule.limit - 1 };

  if (row.count <= rule.limit) {
    return { allowed: true, remaining: rule.limit - row.count };
  }

  const elapsed = (now.getTime() - new Date(row.window_start).getTime()) / 1000;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(Math.ceil(rule.windowSeconds - elapsed), 1),
  };
}

/**
 * Sayacı ARTIRMADAN durumunu okur.
 *
 * Girişte gerekiyor: sınır parola doğrulanmadan önce bakılmalı (yoksa her
 * deneme bir scrypt hesabı yaptırır), ama sayaç yalnızca deneme gerçekten
 * başarısız olduğunda artmalı.
 *
 * Bu, kaçınılmaz olarak bir "önce oku, sonra yaz" adımıdır — projedeki diğer
 * yerlerin aksine. Kabul edilebilir olmasının sebebi: sayacın kendisi yine
 * atomik artıyor, dolayısıyla eksik saymıyor. Yarışın etkisi, sınır tam
 * aşılırken uçuşta olan birkaç isteğin geçmesi; bir kaba kuvvet saldırısında
 * beş yerine on deneme yapılabilmesi hiçbir şeyi değiştirmez.
 */
export async function peek(
  bucket: string,
  rule: LimitRule,
  now = new Date()
): Promise<LimitResult> {
  const row = await (
    await db()
  ).get<{ window_start: string; count: number }>(
    'SELECT window_start, count FROM rate_limits WHERE bucket = ?',
    [bucket]
  );

  if (!row) return { allowed: true, remaining: rule.limit };

  const elapsed = (now.getTime() - new Date(row.window_start).getTime()) / 1000;

  // Pencere kapanmışsa sayaç zaten sıfırlanacak; şimdiden temiz sayılır.
  if (elapsed >= rule.windowSeconds) return { allowed: true, remaining: rule.limit };

  if (row.count < rule.limit) return { allowed: true, remaining: rule.limit - row.count };

  return {
    allowed: false,
    retryAfterSeconds: Math.max(Math.ceil(rule.windowSeconds - elapsed), 1),
  };
}

/**
 * Sayacı sıfırlar.
 *
 * Başarılı girişten sonra çağrılır: parolasını hatırlayamayıp birkaç kez
 * yanlış giren biri, sonunda doğru girdiğinde cezalı kalmamalı. Sınır
 * saldırgan içindir, unutkan kullanıcı için değil.
 */
export async function reset(bucket: string): Promise<void> {
  await (await db()).run('DELETE FROM rate_limits WHERE bucket = ?', [bucket]);
}

/*
 * Penceresi dolmuş sayaç satırlarının temizliği `lib/jobs/index.mjs` içinde.
 * Tablo aksi hâlde her IP ve e-posta için sonsuza kadar bir satır tutardı —
 * hem gereksiz büyürdü hem de IP adresi kişisel veri olduğu için saklama
 * politikasına aykırı olurdu.
 */

/** Kova adı. Girdi ayracı içerse bile kovalar karışmasın diye kodlanır. */
export function bucketKey(kind: string, value: string): string {
  return `${kind}:${encodeURIComponent(value)}`;
}

/** "3 dakika" gibi okunabilir bir süre — kullanıcıya gösterilir. */
export function describeRetry(seconds: number): string {
  if (seconds < 60) return 'birkaç saniye';
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} dakika`;
}
