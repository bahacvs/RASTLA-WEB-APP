'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { createLink, listLinks, setLinkDisabled } from '@/lib/db/booking-links';
import { getActivityById } from '@/lib/db/activities';
import type { BookingSource } from '@/lib/booking-sources';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';

/**
 * Paylaşım linki yönetimi.
 *
 * Yetki `aktivite.yonet`: link ilanın bir parçası ve onu paylaşacak kişi
 * zaten ilanı yöneten kişi. Saha personeline açmak, işletmenin kanal
 * yapısını değiştirme yetkisini sahile taşımak olurdu.
 */

export type LinkState = { error?: string; message?: string };

/** Linkin takabileceği kanallar. Telefon ve otel elle kayıtta kalıyor. */
const LINK_SOURCES: BookingSource[] = ['link', 'instagram', 'whatsapp'];

/** Aynı ilanda sınırsız link açılmasın: kanal sayısı sonlu, liste okunur kalmalı. */
const MAX_LINKS = 12;

export async function createLinkAction(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const session = await requireCapability('aktivite.yonet');
  if (!session) return { error: 'Bu işlem için yetkiniz yok.' };

  const activityId = String(formData.get('activityId') ?? '');
  const activity = await getActivityById(activityId);
  if (!activity || activity.operatorId !== session.operator.id) {
    return { error: 'Bu aktiviteye erişim yetkiniz yok.' };
  }

  const label = String(formData.get('label') ?? '').trim();
  if (label.length < 2) return { error: 'Linke bir ad verin: "Instagram bio" gibi.' };

  const sourceRaw = String(formData.get('source') ?? 'link');
  const source: BookingSource = (LINK_SOURCES as string[]).includes(sourceRaw)
    ? (sourceRaw as BookingSource)
    : 'link';

  const existing = await listLinks(activityId);
  if (existing.filter((l) => l.disabledAt === null).length >= MAX_LINKS) {
    return { error: `En fazla ${MAX_LINKS} açık link olabilir. Kullanmadıklarınızı kapatın.` };
  }

  const link = await createLink({
    activityId,
    operatorId: session.operator.id,
    label,
    source,
  });

  await record({
    action: 'activity.updated',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: session.operator.id,
    targetType: 'activity',
    targetId: activityId,
    ...(await requestContext()),
    meta: { link: link.code, label, source },
  });

  revalidatePath(`/isletme/aktiviteler/${activityId}`);
  return { message: `"${label}" linki hazır.` };
}

export async function toggleLinkAction(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const session = await requireCapability('aktivite.yonet');
  if (!session) return { error: 'Bu işlem için yetkiniz yok.' };

  const id = String(formData.get('id') ?? '');
  const disable = formData.get('disable') === '1';

  const changed = await setLinkDisabled(id, session.operator.id, disable);
  if (!changed) return { error: 'Bu linke erişim yetkiniz yok.' };

  revalidatePath(`/isletme/aktiviteler/${String(formData.get('activityId') ?? '')}`);
  return {
    message: disable
      ? 'Link kapatıldı. Basılı QR taranırsa müşteri ana sayfaya düşer.'
      : 'Link yeniden açık.',
  };
}
