'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  cancelBooking,
  cancelDay,
  getBookingByCode,
  redeemBooking,
  rescheduleBooking,
  type Booking,
} from '@/lib/db/bookings';
import { notifyCancellation, notifyCancellations, notifyReschedule } from '@/lib/notify.mjs';
import { displayContact, getUser } from '@/lib/db/users';
import {
  authenticateOperatorUser,
  getOperatorUser,
  normalizeEmail,
  recordLogin,
} from '@/lib/db/operators';
import { sendVerificationCode, verifyCode } from '@/lib/verification';
import { operatorCodeMessage } from '@/lib/sms/messages';
import { maskPhone } from '@/lib/sms';
import { currentOperator } from '@/lib/auth';
import {
  clearOperatorSession,
  clearPendingOperator,
  getPendingOperator,
  setOperatorSession,
  setPendingOperator,
} from '@/lib/session';
import { getActivityBySlug } from '@/lib/db/activities';
import { refundBooking } from '@/lib/payments/flow';
import { releasePayoutForBooking } from '@/lib/payments/payouts';
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

/**
 * `step` alanı arayüzün hangi ekranı göstereceğini belirler:
 *   undefined -> e-posta + parola
 *   'code'    -> ikinci faktör kodu
 */
export type LoginState = { error?: string; step?: 'code'; phoneHint?: string };

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
    const gate = await peek(bucket, rule);
    if (!gate.allowed) {
      await record({
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

  const result = await authenticateOperatorUser(email, password);

  if (!result.ok) {
    for (const [bucket, rule] of buckets) await consume(bucket, rule);

    // Başarısız denemeler de kaydedilir: bir ihlali fark ettiren çoğunlukla
    // başarılı girişler değil, aynı kaynaktan gelen deneme yoğunluğudur.
    // Parola HİÇBİR koşulda günlüğe yazılmaz.
    await record({
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
  await reset(emailBucket);

  // ---- İkinci faktör ----
  //
  // Parola doğru olsa bile oturum HENÜZ AÇILMAZ. Bilet onayı geri alınamaz bir
  // işlem; parolası ele geçmiş bir hesabın tek başına girebilmesi, bu projedeki
  // en pahalı hatanın kapısı olurdu.
  //
  // Numarası olmayan hesaplar (bu özellikten önce açılmış olanlar) parolayla
  // girmeye devam eder ve ekip ekranında yüksek sesle uyarılır. Onları burada
  // kilitlemek, çalışan bir işletmeyi sahada dışarıda bırakmak olurdu.
  if (result.user.phone) {
    const sent = await sendVerificationCode({
      phone: result.user.phone,
      purpose: 'operator_login',
      operatorUserId: result.user.id,
      message: operatorCodeMessage,
      context,
    });

    if (!sent.ok) return { error: sent.error };

    // Yarım kalmış giriş ayrı ve kısa ömürlü bir çerezde taşınır; asıl oturum
    // çerezine yazılsaydı ikinci faktörü geçmemiş biri korunan sayfalara
    // girebilirdi.
    await setPendingOperator(result.user.id);

    return { step: 'code', phoneHint: maskPhone(result.user.phone) };
  }

  await recordLogin(result.user.id);
  await record({
    action: 'operator.login',
    actorType: 'operator',
    actorId: result.user.id,
    operatorId: result.operator.id,
    ...context,
    meta: { secondFactor: false },
  });

  await setOperatorSession(result.user.id);
  redirect('/isletme/bugun');
}

/**
 * İkinci faktör kodunu doğrular ve oturumu asıl o zaman açar.
 *
 * Bekleyen giriş kimliği FORMDAN DEĞİL, imzalı çerezden okunur: form alanına
 * güvenilseydi kod bilen biri istediği hesabın oturumunu açabilirdi.
 */
export async function operatorVerifyAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const context = await requestContext();

  const pendingId = await getPendingOperator();
  if (!pendingId) {
    return { error: 'Giriş oturumu zaman aşımına uğradı. Baştan deneyin.' };
  }

  const user = await getOperatorUser(pendingId);
  if (!user || user.status !== 'active' || !user.phone) {
    await clearPendingOperator();
    return { error: 'Hesaba erişilemedi. Baştan deneyin.' };
  }

  const result = await verifyCode({
    phone: user.phone,
    purpose: 'operator_login',
    code: String(formData.get('code') ?? ''),
    context,
  });

  if (!result.ok) {
    await record({
      action: 'operator.login_failed',
      actorType: 'anonymous',
      operatorId: user.operatorId,
      outcome: 'failure',
      ...context,
      meta: { email: user.email, reason: 'second_factor' },
    });
    return { error: result.error, step: 'code', phoneHint: maskPhone(user.phone) };
  }

  // Kod, girişi başlatan hesap için üretilmiş olmalı. Aynı numarayı paylaşan
  // iki hesap varsa birinin kodu diğerinin girişini açmamalı.
  if (result.operatorUserId && result.operatorUserId !== user.id) {
    await clearPendingOperator();
    return { error: 'Kod bu hesap için geçerli değil.' };
  }

  await clearPendingOperator();
  await recordLogin(user.id);
  await record({
    action: 'operator.login',
    actorType: 'operator',
    actorId: user.id,
    operatorId: user.operatorId,
    ...context,
    meta: { secondFactor: true },
  });

  await setOperatorSession(user.id);
  redirect('/isletme/bugun');
}

/**
 * Yarım kalmış girişi iptal eder.
 *
 * Yalnızca ekranı değiştirmek yetmez: bekleyen giriş çerezi sunucuda da
 * geçersiz kılınmalı, aksi hâlde 5 dakika boyunca ortada kod bekleyen bir
 * hesap kalırdı.
 */
export async function operatorCancelLoginAction() {
  await clearPendingOperator();
  redirect('/isletme');
}

export async function operatorLogoutAction() {
  const session = await currentOperator();
  if (session) {
    await record({
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

async function describe(booking: Booking, customerName: string) {
  const activity = await getActivityBySlug(booking.activitySlug);
  return {
    code: booking.code,
    activityTitle: activity?.title ?? booking.activitySlug,
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
  async function countFailure(): Promise<string | null> {
    const gate = await consume(failureBucket, LIMITS.redeemFailures);
    return gate.allowed
      ? null
      : `Çok fazla başarısız deneme. ${describeRetry(gate.retryAfterSeconds)} sonra tekrar deneyin.`;
  }

  const existing = await getBookingByCode(code);
  if (!existing) {
    const limited = await countFailure();
    await record({
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
    const limited = await countFailure();
    // Başka işletmenin biletini okutmaya çalışmak ya karışıklıktır ya da
    // sondaj; her iki hâlde de görülebilir olmalı.
    await record({
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
  const result = await redeemBooking(code, session.user.id);
  const customerName = displayContact(await getUser(existing.userId)).name;

  if (result.ok) {
    // Geçerli bir onay, o personelin başarısız deneme sayacını sıfırlar:
    // gerçek iş yapıldığı belli.
    await reset(failureBucket);

    // Hizmet verildi: işletmenin payı serbest bırakılır. Bugün ekranındaki
    // "Geldi" düğmesiyle aynı çağrı — iki ayrı yol, tek güvence.
    await releasePayoutForBooking(result.booking.id);

    await record({
      ...actor,
      action: 'booking.redeemed',
      targetType: 'booking',
      targetId: result.booking.id,
    });

    revalidatePath('/rezervasyonlarim');
    return {
      status: 'success',
      message: 'Bilet onaylandı. Misafiri kabul edebilirsiniz.',
      booking: await describe(result.booking, customerName),
    };
  }

  await record({
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
        ...(await describe(result.booking, customerName)),
        redeemedAt: new Date(result.booking.redeemedAt!).toLocaleString('tr-TR'),
      },
    };
  }

  // Ödemesi tamamlanmamış bilet, personele açıkça söylenmeli: "geçersiz"
  // demek, misafirin ekranındaki QR'ı gören personeli tartışmanın içinde
  // bırakırdı. Sebep belliyse çözüm de belli — ödeme tamamlanmamış.
  if (result.reason === 'unpaid') {
    return { status: 'error', message: 'Bu rezervasyonun ödemesi tamamlanmamış.' };
  }
  if (result.reason === 'expired') {
    return { status: 'error', message: 'Ödeme süresi dolduğu için rezervasyon düşmüş.' };
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

  const booking = await getBookingByCode(code);
  if (!booking || booking.operatorId !== operatorId) {
    return { error: 'Bu rezervasyona erişim yetkiniz yok.' };
  }

  const result = await cancelBooking(code, reason);
  if (!result.ok) {
    if (result.reason === 'already_redeemed') {
      return { error: 'Bilet kullanılmış, iptal edilemez.' };
    }
    return { error: 'Rezervasyon zaten iptal edilmiş.' };
  }

  const context = await requestContext();

  await record({
    action: 'booking.cancelled',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId,
    targetType: 'booking',
    targetId: booking.id,
    ...context,
    meta: { reason },
  });

  // İşletme ya da hava kaynaklı iptalde iade KOŞULSUZ ve otomatik: müşteri
  // kusurlu değil, hizmet verilmedi. İade kararını insana bırakmak, en sık
  // yaşanan iptal türünde en sık şikâyet edilen sonucu üretirdi.
  const refund = await refundBooking({
    bookingId: booking.id,
    operatorId,
    reason,
    context,
  });

  // Müşteriye haber verilir. Gönderim BAŞARISIZ OLSA DA iptal geçerlidir:
  // iptal veritabanında olmuştur, kapasite iade edilmiştir ve SMS sağlayıcısı
  // erişilemediği için bunları geri almak tutarsızlık üretirdi. Personele
  // doğrusu söylenir, "misafirleri bilgilendirmeyi unutmayın" cümlesinin
  // yerini artık bu alıyor.
  const notice = await notifyCancellation(result.booking, reason === 'weather');

  revalidatePath('/isletme/rezervasyonlar');
  return {
    message: `Rezervasyon iptal edildi ve slot kapasitesi geri verildi.${
      refund.ok ? ' Müşteriye tam iade başlatıldı.' : ''
    }${notice.sent ? ' Misafire bilgi mesajı gönderildi.' : ' MİSAFİRE MESAJ GİTMEDİ, kendiniz arayın.'}`,
  };
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

  const { cancelled, skipped } = await cancelDay(operatorId, date, 'weather');
  const context = await requestContext();

  // Toplu iptal tek satırda kaydedilir: kaç rezervasyonun etkilendiği
  // meta'da durur, tek tek kayıt açmak günlüğü okunmaz hâle getirirdi.
  await record({
    action: 'booking.day_cancelled',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId,
    ...context,
    meta: { date, cancelled: cancelled.length, skipped, reason: 'weather' },
  });

  // Hava iptalinde iade otomatik ve tam. İadeler tek tek yapılıyor çünkü her
  // biri sağlayıcıda ayrı bir işlem; biri başarısız olursa diğerleri devam
  // etmeli. `refundBooking` idempotent, bu yüzden iş yarıda kalıp tekrar
  // çalıştırılsa da kimseye iki kez para gitmez.
  let refunded = 0;
  for (const booking of cancelled) {
    const refund = await refundBooking({
      bookingId: booking.id,
      operatorId,
      reason: 'weather',
      context,
    });
    if (refund.ok) refunded++;
  }

  // Bildirimler tek tek gider ve biri başarısız olsa da diğerleri denenir;
  // ilk hatada durmak, listenin sonundaki misafirleri sebepsiz habersiz
  // bırakırdı.
  const notices = await notifyCancellations(cancelled, true);

  revalidatePath('/isletme/rezervasyonlar');
  return {
    message:
      cancelled.length === 0
        ? 'İptal edilecek aktif rezervasyon yoktu.'
        : `${cancelled.length} rezervasyon iptal edildi${
            skipped > 0 ? `, ${skipped} tanesi atlandı` : ''
          }${refunded > 0 ? `, ${refunded} ödeme iade edildi` : ''}, ${notices.sent} misafire bilgi mesajı gönderildi.${
            notices.failed > 0 ? ` ${notices.failed} MESAJ GİTMEDİ, onları kendiniz arayın.` : ''
          }`,
  };
}

export type RescheduleState = { error?: string; message?: string };

/**
 * Rezervasyonu başka bir saate taşır.
 *
 * Hava kötüleştiğinde iptal tek seçenek olmamalı: müşteri parasını değil
 * aktiviteyi istiyor. Taşıma iadeyi ve hak edişi hiç açmadığı için hem
 * müşteri hem işletme için iptalden iyi bir sonuç.
 *
 * Kesit kuralı (`booking_cutoff_minutes`) BURADA UYGULANMIYOR ve bu bilinçli:
 * o kural müşterinin son dakika rezervasyon açmasını engellemek için var.
 * İşletme, başlamak üzere olan bir seansı yarım saat ilerisine taşıyabilmeli;
 * kuralı burada da işletmek, taşımayı tam ihtiyaç duyulduğu anda kilitlerdi.
 * Kapasite ve ekipman sınırları ise `rescheduleBooking` içindeki koşullu
 * UPDATE'te aynen geçerli.
 */
export async function rescheduleAction(
  _prev: RescheduleState,
  formData: FormData
): Promise<RescheduleState> {
  const session = await currentOperator();
  if (!session) return { error: 'Oturum sona ermiş.' };
  const operatorId = session.operator.id;

  const code = String(formData.get('code') ?? '').trim();
  const slotId = String(formData.get('slotId') ?? '').trim();
  if (!code || !slotId) return { error: 'Rezervasyon ya da yeni saat seçilmedi.' };

  const booking = await getBookingByCode(code);
  if (!booking || booking.operatorId !== operatorId) {
    return { error: 'Bu rezervasyona erişim yetkiniz yok.' };
  }

  const result = await rescheduleBooking(code, slotId);
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: 'Rezervasyon bulunamadı.',
      not_confirmed: 'Yalnızca onaylanmış rezervasyonlar taşınabilir.',
      same_slot: 'Rezervasyon zaten bu saatte.',
      slot_not_found: 'Seçilen saat bulunamadı.',
      other_activity: 'Rezervasyon yalnızca aynı aktivitenin başka bir saatine taşınabilir.',
      closed: 'Seçilen saat kapalı.',
      full: 'Seçilen saatte yeterli yer yok.',
      no_equipment: 'Seçilen saatte yeterli ekipman yok.',
      moved: 'Rezervasyon bu sırada değişti; sayfayı yenileyip tekrar deneyin.',
    };
    return { error: messages[result.reason] ?? 'Rezervasyon taşınamadı.' };
  }

  await record({
    action: 'booking.rescheduled',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId,
    targetType: 'booking',
    targetId: booking.id,
    ...(await requestContext()),
    // Nereden nereye taşındığı YALNIZCA burada duruyor: rezervasyon satırı
    // yalnızca yeni saati taşıyor ve "eskiden neydi" sorusu uyuşmazlıkta
    // soruluyor.
    meta: {
      from: `${result.from.date} ${result.from.time}`,
      to: `${result.booking.bookingDate} ${result.booking.bookingTime}`,
    },
  });

  const notice = await notifyReschedule(result.booking, result.from);

  revalidatePath('/isletme/rezervasyonlar');
  revalidatePath('/isletme');
  return {
    message: `Rezervasyon ${result.booking.bookingDate} ${result.booking.bookingTime} saatine taşındı.${
      notice.sent ? ' Misafire bilgi mesajı gönderildi.' : ' MİSAFİRE MESAJ GİTMEDİ, kendiniz arayın.'
    }`,
  };
}
