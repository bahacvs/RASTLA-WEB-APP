import { requireCapability } from '@/lib/auth';
import { listPayouts } from '@/lib/db/payouts';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';

/**
 * Mutabakat raporu — CSV.
 *
 * Muhasebeciye gönderilecek dosya bu. Ekrandaki tablo insan içindir ve
 * kırpılır; burada kırpma yok, tarih aralığı verilebiliyor.
 *
 * **Yetki `finans.goruntule`**: yöneticide ve saha personelinde yok. Ayrıca
 * indirme, işlem günlüğüne düşüyor — hak ediş kayıtları ticari veridir ve
 * dışarı çıktığı an kayda geçmelidir.
 */

/** Excel'in Türkçe yerelinde ayırıcıyı doğru seçmesi için. */
const SEPARATOR = ';';

function cell(value: string | number | null): string {
  const text = String(value ?? '');
  // Alan ayırıcı, tırnak ya da satır sonu içeren değer tırnaklanır; tırnaklar
  // ikilenir. Kaçırılsaydı tek bir aktivite adı bütün sütunları kaydırırdı.
  return /["\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request) {
  const session = await requireCapability('finans.goruntule');
  if (!session) return new Response('Yetkiniz yok.', { status: 403 });

  const url = new URL(request.url);
  const from = url.searchParams.get('baslangic') ?? undefined;
  const to = url.searchParams.get('bitis') ?? undefined;

  const lines = await listPayouts(session.operator.id, { from, to, limit: 5000 });

  const header = [
    'Tarih',
    'Saat',
    'Bilet',
    'Aktivite',
    'Brüt (TL)',
    'Komisyon (TL)',
    'İade (TL)',
    'Net (TL)',
    'Durum',
    'Hak ediş tarihi',
  ];

  const rows = lines.map((line) =>
    [
      line.bookingDate,
      line.bookingTime,
      line.bookingCode,
      line.activitySlug,
      line.grossTRY,
      line.commissionTRY,
      line.refundedTRY,
      line.netTRY,
      line.status,
      line.releasedAt ?? '',
    ]
      .map(cell)
      .join(SEPARATOR)
  );

  await record({
    action: 'account.exported',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: session.operator.id,
    targetType: 'payouts',
    targetId: session.operator.id,
    ...(await requestContext()),
    meta: { rows: lines.length, from: from ?? null, to: to ?? null },
  });

  // BOM: Excel UTF-8 olduğunu ancak bununla anlıyor. Yoksa Türkçe karakterler
  // bozuk görünür ve dosya "çalışmıyor" sanılır.
  const body = `﻿${[header.map(cell).join(SEPARATOR), ...rows].join('\r\n')}\r\n`;

  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="rastla-mutabakat-${session.operator.id}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
