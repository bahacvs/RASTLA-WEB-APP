import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Basit imzalı çerez oturumu.
 *
 * Pilot seviyesindedir: kimlik telefon numarasıyla beyan edilir, doğrulanmaz.
 * Çerez imzalıdır (kullanıcı içeriğini değiştiremez) ama numaranın gerçekten
 * o kişiye ait olduğu kanıtlanmaz. Üretimde SMS OTP eklenmelidir — bkz. README.
 */

const SECRET = process.env.SESSION_SECRET ?? 'gelistirme-icin-guvensiz-varsayilan';
const USER_COOKIE = 'rastla_user';
const OPERATOR_COOKIE = 'rastla_operator';
const MAX_AGE = 60 * 60 * 24 * 90; // 90 gün

function sign(value: string): string {
  return createHmac('sha256', SECRET).update(value).digest('base64url');
}

function pack(value: string): string {
  return `${value}.${sign(value)}`;
}

function unpack(cookie: string | undefined): string | null {
  if (!cookie) return null;

  const index = cookie.lastIndexOf('.');
  if (index <= 0) return null;

  const value = cookie.slice(0, index);
  const provided = Buffer.from(cookie.slice(index + 1));
  const expected = Buffer.from(sign(value));

  // Uzunluk farklıysa timingSafeEqual hata atar; önce onu ele al.
  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? value : null;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE,
} as const;

export async function setUserSession(userId: string) {
  (await cookies()).set(USER_COOKIE, pack(userId), COOKIE_OPTIONS);
}

export async function getUserId(): Promise<string | null> {
  return unpack((await cookies()).get(USER_COOKIE)?.value);
}

export async function clearUserSession() {
  (await cookies()).delete(USER_COOKIE);
}

/**
 * İşletme oturumu, işletmenin değil **kişinin** kimliğini taşır.
 *
 * Bilet onayı geri alınamaz bir işlemdir; çereze işletme kimliği yazılsaydı
 * denetim kaydı "hangi işletme" sorusunu cevaplar, "kim" sorusunu cevaplamazdı.
 * İşletme kimliği hesaptan türetilir — bkz. lib/auth.ts.
 */
export async function setOperatorSession(operatorUserId: string) {
  (await cookies()).set(OPERATOR_COOKIE, pack(operatorUserId), COOKIE_OPTIONS);
}

export async function getOperatorUserId(): Promise<string | null> {
  return unpack((await cookies()).get(OPERATOR_COOKIE)?.value);
}

export async function clearOperatorSession() {
  (await cookies()).delete(OPERATOR_COOKIE);
}

/**
 * RASTLA operasyon ekibinin oturumu — işletme oturumundan AYRI çerez.
 *
 * Aynı çerezde taşınsaydı, bir işletme hesabı ile platform hesabı arasındaki
 * fark yalnızca veritabanı sorgusuna kalırdı ve o sorgunun bir yerde
 * atlanması, işletme personelinin yönetim paneline girmesi demek olurdu.
 * Ayrı çerez bu hatayı yapısal olarak imkânsız kılıyor: işletme oturumu
 * `/yonetim` için hiçbir şey ifade etmiyor.
 */
const PLATFORM_COOKIE = 'rastla_platform';

export async function setPlatformSession(platformUserId: string) {
  (await cookies()).set(PLATFORM_COOKIE, pack(platformUserId), COOKIE_OPTIONS);
}

export async function getPlatformUserId(): Promise<string | null> {
  return unpack((await cookies()).get(PLATFORM_COOKIE)?.value);
}

export async function clearPlatformSession() {
  (await cookies()).delete(PLATFORM_COOKIE);
}

/**
 * Yarım kalmış işletme girişi — parola doğru, ikinci faktör bekleniyor.
 *
 * Ayrı ve **kısa ömürlü** bir çerezde taşınır. Asıl oturum çerezine
 * yazılsaydı, ikinci faktörü geçmemiş biri o çerezle korunan sayfalara
 * girebilirdi: parola doğrulaması tek başına giriş sayılmamalı.
 *
 * Değer `<hesapKimliği>.<sonKullanma>` biçiminde ve imzalıdır; süre çerezin
 * ömrüne değil imzalı içeriğe yazılır — çerez süresi tarayıcı tarafından
 * uzatılabilir, imzalı içerik uzatılamaz.
 */
const PENDING_OPERATOR_COOKIE = 'rastla_operator_pending';
const PENDING_MAX_AGE = 5 * 60;

export async function setPendingOperator(operatorUserId: string) {
  const expiresAt = Date.now() + PENDING_MAX_AGE * 1000;
  (await cookies()).set(PENDING_OPERATOR_COOKIE, pack(`${operatorUserId}.${expiresAt}`), {
    ...COOKIE_OPTIONS,
    maxAge: PENDING_MAX_AGE,
  });
}

export async function getPendingOperator(): Promise<string | null> {
  const value = unpack((await cookies()).get(PENDING_OPERATOR_COOKIE)?.value);
  if (!value) return null;

  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;

  const expiresAt = Number(value.slice(separator + 1));
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  return value.slice(0, separator);
}

export async function clearPendingOperator() {
  (await cookies()).delete(PENDING_OPERATOR_COOKIE);
}
