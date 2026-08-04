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
