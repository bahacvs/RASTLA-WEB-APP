'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { currentOperator } from '@/lib/auth';
import { getActivityById } from '@/lib/db/activities';
import {
  addImage,
  countImages,
  deleteImage,
  getImage,
  makeCover,
  setAlt,
  syncActivity,
} from '@/lib/db/activity-images';
import { MAX_IMAGES_PER_ACTIVITY, MAX_UPLOAD_BYTES, processImage } from '@/lib/images';
import { storage } from '@/lib/storage';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';

/**
 * Aktivite görsellerinin yüklenmesi ve silinmesi.
 *
 * Görsel yüklemek katalog düzenlemenin bir parçası, dolayısıyla **sahibe**
 * ayrılmış. Sahiplik her eylemde sunucuda yeniden doğrulanıyor: kimlik
 * formdan geliyor ve başka bir işletmenin aktivitesine ait olabilir.
 */

export type ImageState = { error?: string; message?: string };

/** Sahibin yalnızca kendi aktivitesine dokunabilmesini sağlar. */
async function ownActivity(activityId: string) {
  const session = await currentOperator();
  if (!session || session.user.role !== 'owner') return null;

  const activity = await getActivityById(activityId);
  if (!activity || activity.operatorId !== session.operator.id) return null;

  return { session, activity };
}

export async function uploadImageAction(
  _prev: ImageState,
  formData: FormData
): Promise<ImageState> {
  const activityId = String(formData.get('activityId') ?? '');
  const owned = await ownActivity(activityId);
  if (!owned) return { error: 'Bu aktiviteye erişim yetkiniz yok.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Bir dosya seçin.' };

  // Bildirilen boyut, baytları belleğe almadan önceki ilk süzgeç. Asıl kontrol
  // yine de gerçek uzunluk üzerinden yapılıyor (lib/images.ts): `File.size`
  // istemciden gelen bir değer.
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'Dosya 6 MB sınırını aşıyor.' };

  // Adet sınırı yüklemeden ÖNCE: sınırı aşan bir dosyayı işleyip sonra
  // reddetmek boşuna işlemci ve depo trafiği olurdu.
  if ((await countImages(activityId)) >= MAX_IMAGES_PER_ACTIVITY) {
    return { error: `Aktivite başına en fazla ${MAX_IMAGES_PER_ACTIVITY} görsel eklenebilir.` };
  }

  const processed = await processImage(Buffer.from(await file.arrayBuffer()));
  if (!processed.ok) return { error: processed.error };

  // Anahtar rastgele: dosya adından türetilseydi hem çakışırdı hem de
  // işletmenin verdiği ad (bazen müşteri adı taşır) depoda görünür olurdu.
  const key = `aktivite/${activityId}/${randomUUID()}.webp`;
  await storage().put(key, processed.body, processed.contentType);

  const image = await addImage({
    activityId,
    storageKey: key,
    contentType: processed.contentType,
    alt: String(formData.get('alt') ?? '').trim() || null,
    width: processed.width,
    height: processed.height,
    bytes: processed.bytes,
    uploadedBy: owned.session.user.id,
  });

  await syncActivity(activityId);

  await record({
    action: 'activity.image_uploaded',
    actorType: 'operator',
    actorId: owned.session.user.id,
    operatorId: owned.session.operator.id,
    targetType: 'activity',
    targetId: activityId,
    ...(await requestContext()),
    // Dosya ADI günlüğe yazılmıyor: kullanıcı girdisi ve bazen kişisel bilgi
    // taşır ("ahmet-dugun-2024.jpg" gibi).
    meta: { imageId: image.id, bytes: processed.bytes, boyut: `${image.width}x${image.height}` },
  });

  revalidatePath(`/isletme/aktiviteler/${activityId}`);
  return { message: 'Görsel eklendi.' };
}

export async function deleteImageAction(
  _prev: ImageState,
  formData: FormData
): Promise<ImageState> {
  const imageId = String(formData.get('imageId') ?? '');
  const image = await getImage(imageId);
  if (!image) return { error: 'Görsel bulunamadı.' };

  const owned = await ownActivity(image.activityId);
  if (!owned) return { error: 'Bu görsele erişim yetkiniz yok.' };

  // Önce kayıt, sonra dosya. Ters sıra yapılsaydı ve arada süreç ölseydi,
  // kaydı duran ama dosyası olmayan bir görsel kalırdı ve sayfa kırık kutu
  // gösterirdi. Bu sırada en kötü ihtimalle depoda sahipsiz bir dosya kalır.
  await deleteImage(imageId);
  await storage().delete(image.storageKey);
  await syncActivity(image.activityId);

  await record({
    action: 'activity.image_deleted',
    actorType: 'operator',
    actorId: owned.session.user.id,
    operatorId: owned.session.operator.id,
    targetType: 'activity',
    targetId: image.activityId,
    ...(await requestContext()),
    meta: { imageId },
  });

  revalidatePath(`/isletme/aktiviteler/${image.activityId}`);
  return { message: 'Görsel silindi.' };
}

export async function makeCoverAction(_prev: ImageState, formData: FormData): Promise<ImageState> {
  const imageId = String(formData.get('imageId') ?? '');
  const image = await getImage(imageId);
  if (!image) return { error: 'Görsel bulunamadı.' };
  if (!(await ownActivity(image.activityId))) return { error: 'Yetkiniz yok.' };

  await makeCover(imageId, image.activityId);
  await syncActivity(image.activityId);

  revalidatePath(`/isletme/aktiviteler/${image.activityId}`);
  return { message: 'Kapak görseli değişti.' };
}

export async function setAltAction(_prev: ImageState, formData: FormData): Promise<ImageState> {
  const imageId = String(formData.get('imageId') ?? '');
  const image = await getImage(imageId);
  if (!image) return { error: 'Görsel bulunamadı.' };
  if (!(await ownActivity(image.activityId))) return { error: 'Yetkiniz yok.' };

  await setAlt(imageId, String(formData.get('alt') ?? '').trim().slice(0, 200));
  await syncActivity(image.activityId);

  revalidatePath(`/isletme/aktiviteler/${image.activityId}`);
  return { message: 'Açıklama kaydedildi.' };
}
