import { currentUserId } from '@/lib/auth';
import { exportUserData } from '@/lib/db/users';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';

/**
 * Kişisel verilerin JSON olarak indirilmesi — KVKK md. 11 erişim hakkı.
 *
 * Sunucu eylemi değil, rota işleyicisi: tarayıcının dosyayı indirmesi için
 * `Content-Disposition` başlığı gerekiyor ve sunucu eylemleri başlık
 * belirleyemez.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return new Response('Oturum bulunamadı.', { status: 401 });
  }

  const data = exportUserData(userId);
  if (!data) return new Response('Hesap bulunamadı.', { status: 404 });

  record({
    action: 'account.exported',
    actorType: 'customer',
    actorId: userId,
    targetType: 'user',
    targetId: userId,
    ...(await requestContext()),
  });

  const date = data.disaAktarmaTarihi.slice(0, 10);

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="rastla-verilerim-${date}.json"`,
      // Kişisel veri; ara sunucularda ya da tarayıcı önbelleğinde kalmasın.
      'cache-control': 'no-store, private',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
