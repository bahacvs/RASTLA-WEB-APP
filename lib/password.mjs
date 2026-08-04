import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Parola özetleme — scrypt.
 *
 * scrypt seçildi çünkü Node'un standart kütüphanesinde var; bcrypt/argon2
 * yerel derleme gerektiren bir bağımlılık daha eklerdi. Maliyet parametreleri
 * özetin İÇİNDE saklanır, böylece donanım hızlandıkça N artırılabilir ve eski
 * kayıtlar doğrulanmaya devam eder.
 *
 * Biçim: scrypt$N$r$p$<salt-base64>$<hash-base64>
 */

const N = 16384; // 2^14 — ~50-100 ms, etkileşimli giriş için uygun
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// scrypt bellek ihtiyacı yaklaşık 128 * N * r bayt. Node'un 32 MB'lık
// varsayılan sınırı N=16384'te yetersiz kalır, bu yüzden açıkça yükseltilir.
const MAX_MEMORY = 256 * 1024 * 1024;

/**
 * @param {string} password
 * @returns {string}
 */
export function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEMORY,
  });

  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

/**
 * Parolayı özetle karşılaştırır.
 *
 * Karşılaştırma timingSafeEqual ile yapılır: `===` kullanılsaydı ilk farklı
 * bayta kadar geçen süre ölçülerek özet baytları tek tek çıkarılabilirdi.
 */
/**
 * @param {string} password
 * @param {string} stored
 * @returns {boolean}
 */
export function verifyPassword(password, stored) {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  /** @type {Buffer} */
  let actual;
  try {
    actual = scryptSync(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAX_MEMORY,
    });
  } catch {
    // Bozuk parametreler (ör. N ikinin kuvveti değil) scrypt'i hata attırır.
    return false;
  }

  return timingSafeEqual(actual, expected);
}

/** Politika: 10 karakter alt sınırı. Karmaşıklık kuralı yok — uzunluk daha etkili. */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * @param {string} password
 * @returns {string | null}
 */
export function passwordProblem(password) {
  if (password.normalize('NFKC').length < MIN_PASSWORD_LENGTH) {
    return `Parola en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`;
  }
  return null;
}

/** Hesap oluştururken verilecek geçici parola. ~92 bit entropi. */
/** @returns {string} */
export function generatePassword() {
  // Karışabilen karakterler (0/O, 1/l/I, 8/B, 9/g) bilinçli olarak dışarıda:
  // parola telefonda okunarak aktarılacak.
  const alphabet = 'abcdefhijkmnopqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ234567';

  // Reddetme örneklemesi. `byte % 55` doğrudan kullanılsaydı ilk 36 harf
  // diğerlerinden daha sık çıkardı; entropi ilan edilenden düşük olurdu.
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < 16) {
    for (const byte of randomBytes(24)) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === 16) break;
    }
  }

  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12)}`;
}
