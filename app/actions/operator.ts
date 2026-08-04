'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  cancelBooking,
  cancelDay,
  getBookingByCode,
  redeemBooking,
  type Booking,
} from '@/lib/db/bookings';
import { displayContact, getUser } from '@/lib/db/users';
import { authenticateOperatorUser, normalizeEmail, recordLogin } from '@/lib/db/operators';
import { currentOperator } from '@/lib/auth';
import { clearOperatorSession, setOperatorSession } from '@/lib/session';
import { getActivityBySlug } from '@/lib/db/activities';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';
import {
  bucketKey,
  consume,
  describeRetry,
  LIMITS,
  peek,
  reset,
  type LimitRule,
} from '@/lib/db/rate-limit';

export type LoginState = { error?: string };

export async function operatorLoginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const context = await requestContext();

  // Sayılan şey BAŞARISIZ denemedir, deneme değil: günde yirmi kez giren bir
  // personel saldırgan değildir. Kaba kuvvetin tanımı ise arka arkaya
  // başarısızlıktır ve ondan kaçış yok.
  //
  // Kontrol parola doğrulanmadan ÖNCE yapılır — sonra yapılsaydı her deneme
  // yine bir scrypt hesabı yaptırır, saldırgan parolayı bulamasa bile
  // sunucuyu meşgul edebilirdi.
  //
  // İki ayrı kova: IP değiştiren saldırgan e-posta kovasına, e-posta gezen
  // saldırgan IP kovasına takılır.
  const emailBucket = bucketKey('login:email', normalizeEmail(email));
  const buckets: Array<[string, LimitRule]> = [[emailBucket, LIMITS.loginByEmail]];
  if (context.ip) buckets.push([bucketKey('login:ip', context.ip), LIMITS.loginByIp]);

  for (const [bucket, rule] of buckets) {
    const gate = peek(bucket, rule);
    if (!gate.allowed) {
      record({
        action: 'operator.login_failed',
        actorType: 'anonymous',
        outcome: 'denied',
        ...context,
        meta: { email: normalizeEmail(email), reason: 'rate_limited', bucket },
      });

      return {
        error: `Çok fazla deneme yapıldı. ${describeRetry(gate.retryAfterSeconds)} sonra tekrar deneyin.`,
      };
    }
  }

  const result = authenticateOperatorUser(email, password);

  if (!result.ok) {
    for (const [bucket, rule] of buckets) consume(bucket, rule);

    // Başarısız denemeler de kaydedilir: bir ihlali fark ettiren çoğunlukla
    // başarılı girişler değil, aynı kaynaktan gelen deneme yoğunluğudur.
    // Parola HİÇBİR koşulda günlüğe yazılmaz.
    record({
      action: 'operator.login_failed',
      actorType: 'anonymous',
      operatorId: result.matchedOperatorId,
      outcome: 'failure',
      ...context,
      meta: { email: normalizeEmail(email), reason: result.reason },
    });

    // Askıya alınmış hesap ayrı mesaj alır: kişi parolasını doğru girmiştir,
    // "hatalı parola" demek onu boşuna uğraştırırdı. Hesabın varlığı zaten
    // doğru parolayı bilen kişiye ifşa olmuş sayılır.
    if (result.reason === 'suspended') {
      return { error: 'Hesabınız askıya alınmış. İşletme sahibiyle görüşün.' };
    }
    return { error: 'E-posta veya parola hatalı.' };
  }

  // Doğru parolayı girene ceza yok: unutkanlık saldırı değildir. IP kovası
  // bilinçli olarak sıfırlanmaz — aynı adresin arkasındaki başka bir hesaba
  // yapılan denemeler, buradan başarılı bir girişle silinmemeli.
  reset(emailBucket);

  recordLogin(result.user.id);
  record({
    action: 'operator.login',
    actorType: 'operator',
    actorId: result.user.id,
    operatorId: result.operator.id,
    ...context,
  });

  await setOperatorSession(result.user.id);
  redirect('/isletme/tara');
}

export async function operatorLogoutAction() {
  const session = await currentOperator();
  if (session) {
    record({
      action: 'operator.logout',
      actorType: 'operator',
      actorId: session.user.id,
      operatorId: session.operator.id,
      ...(await requestContext()),
    });
  }

  await clearOperatorSession();
  redirect('/isletme');
}

export type ScanState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  booking?: {
    code: string;
    activityTitle: string;
    customerName: string;
    date: string;
    time: string;
    party: string;
    redeemedAt?: string;
  };
};

function describe(booking: Booking, customerName: string) {
  return {
    code: booking.code,
    activityTitle: getActivityBySlug(booking.activitySlug)?.title ?? booking.activitySlug,
    customerName,
    date: booking.bookingDate,
    time: booking.bookingTime,
    party: `${booking.adults} yetişkin${booking.children > 0 ? `, ${booking.children} çocuk` : ''}`,
  };
}

/**
 * Bileti okutup onaylar.
 *
 * Yetkilendirme: bir işletme yalnızca kendi aktivitesine ait bileti
 * onaylayabilir. Bu kontrol, onaylama denemesinden ÖNCE yapılır — aksi hâlde
 * yanlış işletme bileti yakabilirdi.
 */
export async function redeemAction(_prev: ScanState, formData: FormData): Promise<ScanState> {
  const session = await currentOperator();
  if (!session) return { status: 'error', message: 'Oturum sona ermiş. Tekrar giriş yapın.' };
  const operatorId = session.operator.id;

  const raw = String(formData.get('code') ?? '').trim();
  if (!raw) return { status: 'error', message: 'Bilet kodu girin.' };

  // QR bir URL taşır; kamerayla okunduğunda son yol parçası koddur.
  const code = raw.includes('/') ? decodeURIComponent(raw.split('/').filter(Boolean).pop()!) : raw;

  const context = await requestContext();
  const actor = {
    actorType: 'operator',
    actorId: session.user.id,
    operatorId,
    ...context,
  } as const;

  // Yalnızca BAŞARISIZ denemeler sayılır (aşağıda). Başarılı onaylar
  // sınırlanmaz: yoğun bir günde arka arkaya elli bileti okutmak normaldir ve
  // sınıra takılırsa misafirler kapıda bekler.
  const failureBucket = bucketKey('redeem:user', session.user.id);

  /** Başarısız denemeyi sayar; kota dolduysa mesaj döner. */
  function countFailure(): string | null {
    const gate = consume(failureBucket, LIMITS.redeemFailures);
    return gate.allowed
      ? null
      : `Çok fazla başarısız deneme. ${describeRetry(gate.retryAfterSeconds)} sonra tekrar deneyin.`;
  }

  const existing = getBookingByCode(code);
  if (!existing) {
    const limited = countFailure();
    record({
      ...actor,
      action: 'booking.redeem_failed',
      outcome: 'failure',
      meta: { reason: limited ? 'not_found_rate_limited' : 'not_found' },
    });
    return {
      status: 'error',
      message: limited ?? 'Bilet bulunamadı. Kodu kontrol edin.',
    };
  }
  if (existing.operatorId !== operatorId) {
    const limited = countFailure();
    // Başka işletmenin biletini okutmaya çalışmak ya karışıklıktır ya da
    // sondaj; her iki hâlde de görülebilir olmalı.
    record({
      ...actor,
      action: 'booking.redeem_failed',
      outcome: 'denied',
      targetType: 'booking',
      targetId: existing.id,
      meta: { reason: 'wrong_operator', ownerOperatorId: existing.operatorId },
    });
    return {
      status: 'error',
      message: limited ?? 'Bu bilet başka bir işletmeye ait.',
    };
  }

  // Onaylayan olarak işletme değil KİŞİ kaydedilir. Bilet onayı geri alınamaz;
  // bir uyuşmazlıkta ya da ihlalde cevabı gereken soru "hangi işletme" değil,
  // "kim" sorusudur.
  const result = redeemBooking(code, session.user.id);
  const customerName = displayContact(getUser(existing.userId)).name;

  if (result.ok) {
    // Geçerli bir onay, o personelin başarısız deneme sayacını sıfırlar:
    // gerçek iş yapıldığı belli.
    reset(failureBucket);

    record({
      ...actor,
      action: 'booking.redeemed',
      targetType: 'booking',
      targetId: result.booking.id,
    });

    revalidatePath('/rezervasyonlarim');
    return {
      status: 'success',
      message: 'Bilet onaylandı. Misafiri kabul edebilirsiniz.',
      booking: describe(result.booking, customerName),
    };
  }

  record({
    ...actor,
    action: 'booking.redeem_failed',
    outcome: 'failure',
    targetType: 'booking',
    targetId: existing.id,
    meta: { reason: result.reason },
  });

  if (result.reason === 'already_redeemed' && result.booking) {
    return {
      status: 'error',
      message: 'Bu bilet daha önce kullanılmış.',
      booking: {
        ...describe(result.booking, customerName),
        redeemedAt: new Date(result.booking.redeemedAt!).toLocaleString('tr-TR'),
      },
    };
  }

  return { status: 'error', message: 'Bilet geçersiz ya da iptal edilmiş.' };
}

export type OperatorCancelState = { error?: string; message?: string };

/** İşletmenin tek bir rezervasyonu iptal etmesi. */
export async function operatorCancelAction(
  _prev: OperatorCancelState,
  formData: FormData
): Promise<OperatorCancelState> {
  const session = await currentOperator();
  if (!session) return { error: 'Oturum sona ermiş.' };
  const operatorId = session.operator.id;

  const code = String(formData.get('code') ?? '').trim();
  const reason = formData.get('reason') === 'weather' ? 'weather' : 'operator';

  const booking = getBookingByCode(code);
  if (!booking || booking.operatorId !== operatorId) {
    return { error: 'Bu rezervasyona erişim yetkiniz yok.' };
  }

  const result = cancelBooking(code, reason);
  if (!result.ok) {
    if (result.reason === 'already_redeemed') {
      return { error: 'Bilet kullanılmış, iptal edilemez.' };
    }
    return { error: 'Rezervasyon zaten iptal edilmiş.' };
  }

  record({
    action: 'booking.cancelled',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId,
    targetType: 'booking',
    targetId: booking.id,
    ...(await requestContext()),
    meta: { reason },
  });

  revalidatePath('/isletme/rezervasyonlar');
  return { message: 'Rezervasyon iptal edildi ve slot kapasitesi geri verildi.' };
}

/**
 * Hava koşulu nedeniyle bir günün tüm rezervasyonlarını iptal eder.
 *
 * Su sporlarında en sık iptal sebebi budur ve müşteri kusurlu değildir; bu
 * yüzden ayrı bir sebep koduyla kaydedilir — iade politikası farklı işler.
 */
export async function cancelDayAction(
  _prev: OperatorCancelState,
  formData: FormData
): Promise<OperatorCancelState> {
  const session = await currentOperator();
  if (!session) return { error: 'Oturum sona ermiş.' };
  const operatorId = session.operator.id;

  const date = String(formData.get('date') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Gün geçersiz.' };

  const { cancelled, skipped } = cancelDay(operatorId, date, 'weather');

  // Toplu iptal tek satırda kaydedilir: kaç rezervasyonun etkilendiği
  // meta'da durur, tek tek kayıt açmak günlüğü okunmaz hâle getirirdi.
  record({
    action: 'booking.day_cancelled',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId,
    ...(await requestContext()),
    meta: { date, cancelled, skipped, reason: 'weather' },
  });

  revalidatePath('/isletme/rezervasyonlar');
  return {
    message:
      cancelled === 0
        ? 'İptal edilecek aktif rezervasyon yoktu.'
        : `${cancelled} rezervasyon iptal edildi${skipped > 0 ? `, ${skipped} tanesi atlandı` : ''}. Misafirleri bilgilendirmeyi unutmayın.`,
  };
}
