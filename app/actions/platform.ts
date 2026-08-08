'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePlatform } from '@/lib/platform-auth';
import {
  authenticatePlatformUser,
  recordPlatformLogin,
  type PlatformUser,
} from '@/lib/db/platform';
import {
  setCommissionBp,
  setPayoutsSuspended,
  setVerificationStatus,
} from '@/lib/db/operators';
import { VERIFICATION_STATUSES, type VerificationStatus } from '@/lib/verification-status';
import { getActivityById, setActivityStatus } from '@/lib/db/activities';
import { record, type AuditAction } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';
import { clearPlatformSession, setPlatformSession } from '@/lib/session';
import { bucketKey, consume, LIMITS } from '@/lib/db/rate-limit';

/**
 * RASTLA operasyon panelinin sunucu eylemleri.
 *
 * Her biri `requirePlatform` ile başlıyor. Menüde düğmeyi gizlemek
 * yetkilendirme değil: sunucu eylemleri adresi bilen herkese açıktır ve
 * doğrulama testleri tam olarak arayüzü atlayarak bunu sınıyor.
 *
 * Bu paneldeki işlemlerin hepsi TİCARİ SONUÇ doğuruyor (rozet, komisyon,
 * paranın durdurulması); bu yüzden istisnasız hepsi günlüğe yazılıyor ve
 * "kim yaptı" her satırda duruyor.
 */

async function log(
  user: PlatformUser,
  action: AuditAction,
  operatorId: string | null,
  targetType: string,
  targetId: string,
  meta?: Record<string, unknown>
) {
  await record({
    action,
    actorType: 'system',
    actorId: user.id,
    operatorId,
    targetType,
    targetId,
    ...(await requestContext()),
    meta: { ...(meta ?? {}), platformUser: user.email },
  });
}

// ------------------------------------------------------------------- giriş

export type PlatformLoginState = { error?: string };

export async function platformLoginAction(
  _prev: PlatformLoginState,
  formData: FormData
): Promise<PlatformLoginState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const context = await requestContext();

  // Hız sınırı: yönetim paneli, kaba kuvvet denemesi için en değerli hedef.
  const limited = await consume(
    bucketKey('platform-login', context.ip ?? 'bilinmiyor'),
    LIMITS.loginByIp
  );
  if (!limited.allowed) {
    return { error: 'Çok fazla deneme yapıldı. Bir süre sonra tekrar deneyin.' };
  }

  const result = await authenticatePlatformUser(email, password);

  if (!result.ok) {
    await record({
      action: 'platform.login_failed',
      actorType: 'anonymous',
      targetType: 'platform_user',
      targetId: null,
      outcome: 'failure',
      ...context,
      // E-POSTA YAZILMIYOR: başarısız giriş günlüğü, denenen adreslerin
      // listesine dönüşmemeli.
      meta: { reason: result.reason },
    });
    return { error: 'E-posta ya da parola hatalı.' };
  }

  await setPlatformSession(result.user.id);
  await recordPlatformLogin(result.user.id);
  await record({
    action: 'platform.login',
    actorType: 'system',
    actorId: result.user.id,
    targetType: 'platform_user',
    targetId: result.user.id,
    ...context,
    meta: { role: result.user.role },
  });

  redirect('/yonetim/isletmeler');
}

export async function platformLogoutAction() {
  await clearPlatformSession();
  redirect('/yonetim');
}

// ------------------------------------------------------------- doğrulama

export type PlatformActionState = { error?: string; message?: string };

export async function setVerificationAction(
  _prev: PlatformActionState,
  formData: FormData
): Promise<PlatformActionState> {
  const user = await requirePlatform('isletme.dogrula');
  if (!user) return { error: 'Bu işlem için yetkiniz yok.' };

  const operatorId = String(formData.get('operatorId') ?? '');
  const status = String(formData.get('status') ?? '') as VerificationStatus;
  const note = String(formData.get('note') ?? '').trim() || null;

  // Beyaz liste tek kaynaktan: durum listesi büyüdüğünde buradaki kontrolün
  // geride kalması, yeni bir durumun sunucu tarafında reddedilmesi demek olurdu.
  if (!VERIFICATION_STATUSES.includes(status)) return { error: 'Geçersiz durum.' };

  if (!(await setVerificationStatus(operatorId, status, note))) {
    return { error: 'İşletme bulunamadı.' };
  }

  await log(user, 'operator.verification_changed', operatorId, 'operator', operatorId, { status });

  revalidatePath('/yonetim/isletmeler');
  // Rozet müşteri tarafında bu duruma bağlı; ilan sayfaları tazelenmeli.
  revalidatePath('/', 'layout');
  return { message: 'Doğrulama durumu güncellendi.' };
}

export async function setCommissionAction(
  _prev: PlatformActionState,
  formData: FormData
): Promise<PlatformActionState> {
  const user = await requirePlatform('komisyon.belirle');
  if (!user) return { error: 'Bu işlem için yetkiniz yok.' };

  const operatorId = String(formData.get('operatorId') ?? '');
  const percent = Number(String(formData.get('percent') ?? '').replace(',', '.'));
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { error: 'Oran 0 ile 100 arasında olmalı.' };
  }

  const commissionBp = Math.round(percent * 100);
  const result = await setCommissionBp(operatorId, commissionBp);
  if (!result.ok) {
    return { error: result.reason === 'out_of_range' ? 'Oran geçersiz.' : 'İşletme bulunamadı.' };
  }

  await log(user, 'operator.commission_changed', operatorId, 'operator', operatorId, {
    commissionBp,
  });

  revalidatePath('/yonetim/isletmeler');
  return { message: `Komisyon %${percent} olarak ayarlandı.` };
}

export async function togglePayoutsAction(formData: FormData) {
  const user = await requirePlatform('hakedis.durdur');
  if (!user) return;

  const operatorId = String(formData.get('operatorId') ?? '');
  const suspend = formData.get('suspend') === '1';

  if (!(await setPayoutsSuspended(operatorId, suspend))) return;

  await log(
    user,
    suspend ? 'operator.payouts_suspended' : 'operator.payouts_resumed',
    operatorId,
    'operator',
    operatorId
  );

  revalidatePath('/yonetim/isletmeler');
}

// ------------------------------------------------------------ ilan onayı

export async function reviewActivityAction(formData: FormData) {
  const user = await requirePlatform('ilan.incele');
  if (!user) return;

  const id = String(formData.get('id') ?? '');
  const approve = formData.get('approve') === '1';

  const activity = await getActivityById(id);
  // Yalnızca incelemedeki ilana dokunulur: yayındaki bir ilanı buradan
  // "onaylamak" hiçbir şey değiştirmez ama reddetmek, işletmenin yayınını
  // yönetim panelinden habersizce düşürürdü.
  if (!activity || activity.status !== 'pending_review') return;

  await setActivityStatus(id, approve ? 'published' : 'draft');
  await log(
    user,
    approve ? 'activity.review_approved' : 'activity.review_rejected',
    activity.operatorId,
    'activity',
    id,
    { slug: activity.slug }
  );

  revalidatePath('/yonetim/ilanlar');
  revalidatePath('/');
}
