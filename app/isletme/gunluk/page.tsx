import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OperatorNav } from '@/components/OperatorNav';
import { Icon } from '@/components/Icon';
import { currentOperator } from '@/lib/auth';
import { listOperatorUsers } from '@/lib/db/operators';
import {
  countAudit,
  countRecentLoginFailures,
  listAudit,
  type AuditRecord,
} from '@/lib/db/audit';

export const metadata: Metadata = {
  title: 'İşlem Günlüğü',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

/**
 * Eylem adlarının okunabilir karşılıkları.
 *
 * Ham `booking.redeem_failed` gibi adlar günlüğü teknik ekibe hitap eder
 * hâle getirirdi; bunu okuyacak kişi işletme sahibi.
 */
const LABELS: Record<string, string> = {
  'operator.login': 'Giriş yapıldı',
  'operator.login_failed': 'Başarısız giriş denemesi',
  'operator.logout': 'Çıkış yapıldı',
  'operator.password_changed': 'Parola değiştirildi',
  'operator_user.created': 'Ekibe kişi eklendi',
  'operator_user.password_reset': 'Parola sıfırlandı',
  'operator_user.phone_set': 'İkinci faktör numarası ayarlandı',
  'otp.sent': 'Doğrulama kodu gönderildi',
  'otp.verified': 'Doğrulama kodu doğrulandı',
  'otp.failed': 'Doğrulama kodu reddedildi',
  'operator_user.suspended': 'Hesap askıya alındı',
  'operator_user.reactivated': 'Hesap yeniden etkinleştirildi',
  'booking.created': 'Rezervasyon oluşturuldu',
  'booking.redeemed': 'Bilet onaylandı',
  'booking.redeem_failed': 'Bilet onayı reddedildi',
  'booking.cancelled': 'Rezervasyon iptal edildi',
  'booking.day_cancelled': 'Gün toplu iptal edildi',
  'activity.created': 'Aktivite oluşturuldu',
  'activity.updated': 'Aktivite düzenlendi',
  'activity.published': 'Aktivite yayına alındı',
  'activity.unpublished': 'Aktivite yayından kaldırıldı',
  'schedule.rule_created': 'Takvim kuralı eklendi',
  'schedule.rule_toggled': 'Takvim kuralı açıldı/kapatıldı',
  'schedule.slot_toggled': 'Slot açıldı/kapatıldı',
  'account.exported': 'Kişisel veri dışa aktarıldı',
  'account.deleted': 'Hesap silindi',
};

const OUTCOME = {
  success: { label: 'Başarılı', className: 'bg-secondary-container text-on-secondary-container' },
  failure: { label: 'Başarısız', className: 'bg-error-container text-on-error-container' },
  denied: { label: 'Reddedildi', className: 'bg-error-container text-on-error-container' },
};

/** meta alanını insan okunur tek satıra çevirir. */
function describeMeta(entry: AuditRecord): string | null {
  if (!entry.meta) return null;

  const parts: string[] = [];
  for (const [key, value] of Object.entries(entry.meta)) {
    if (value === null || value === undefined || value === '') continue;
    parts.push(`${key}: ${String(value)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ sayfa?: string; eylem?: string }>;
}) {
  const session = await currentOperator();
  if (!session) redirect('/isletme');
  if (session.user.role !== 'owner') redirect('/isletme/tara');

  const { sayfa, eylem } = await searchParams;
  const page = Math.max(Number(sayfa) || 1, 1);
  const action = eylem && LABELS[eylem] ? eylem : undefined;

  // Bir işletme yalnızca kendi bağlamındaki kayıtları görür.
  const operatorId = session.operator.id;

  const entries = await listAudit({
    operatorId,
    action,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const total = await countAudit({ operatorId, action });
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  // Son 24 saatte bu işletmeye yönelik kaç başarısız giriş denemesi oldu.
  // Bu sayının yükselmesi kaba kuvvet denemesinin ilk işaretidir.
  const recentFailures = await countRecentLoginFailures(operatorId);

  const staff = new Map((await listOperatorUsers(operatorId)).map((u) => [u.id, u.name] as const));
  const actorName = (entry: AuditRecord) => {
    if (entry.actorType === 'operator') {
      return entry.actorId ? (staff.get(entry.actorId) ?? 'Silinmiş hesap') : 'İşletme';
    }
    if (entry.actorType === 'customer') return 'Misafir';
    if (entry.actorType === 'anonymous') return 'Kimliksiz istek';
    return 'Sistem';
  };

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />

      <main className="mx-auto max-w-[64rem] px-container-margin py-lg">
        <h1 className="mb-xs text-headline-md text-on-background">İşlem Günlüğü</h1>
        <p className="mb-lg text-body-md text-on-surface-variant">
          Bilet onayı, iptal ve fiyat değişikliği geri alınamaz işlemlerdir. Bu liste hangi
          hesabın ne zaman ne yaptığını gösterir; bir uyuşmazlıkta ya da şüpheli bir durumda
          başvurulacak kayıt budur.
        </p>

        {recentFailures >= 10 && (
          <div className="mb-lg flex items-start gap-2 rounded-xl border border-error bg-error-container p-md text-on-error-container">
            <Icon name="warning" size={20} className="mt-0.5 shrink-0" />
            <p className="text-body-md">
              Son 24 saatte <strong>{recentFailures}</strong> başarısız giriş denemesi var. Bu
              normalden yüksekse parolaları yenileyin ve şüpheli hesapları askıya alın.
            </p>
          </div>
        )}

        <div className="scrollbar-hide mb-lg flex gap-sm overflow-x-auto">
          <FilterChip label="Tümü" href="/isletme/gunluk" active={!action} />
          <FilterChip
            label="Bilet onayları"
            href="/isletme/gunluk?eylem=booking.redeemed"
            active={action === 'booking.redeemed'}
          />
          <FilterChip
            label="Reddedilen onaylar"
            href="/isletme/gunluk?eylem=booking.redeem_failed"
            active={action === 'booking.redeem_failed'}
          />
          <FilterChip
            label="İptaller"
            href="/isletme/gunluk?eylem=booking.cancelled"
            active={action === 'booking.cancelled'}
          />
          <FilterChip
            label="Girişler"
            href="/isletme/gunluk?eylem=operator.login"
            active={action === 'operator.login'}
          />
        </div>

        {entries.length === 0 ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg text-center shadow-card">
            <p className="text-headline-sm text-on-surface">Kayıt yok</p>
            <p className="text-body-md text-on-surface-variant">
              Bu filtreyle eşleşen bir işlem bulunamadı.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-sm">
            {entries.map((entry) => {
              const outcome = OUTCOME[entry.outcome];
              const meta = describeMeta(entry);

              return (
                <li
                  key={entry.id}
                  className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
                >
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-body-lg font-semibold text-on-surface">
                      {LABELS[entry.action] ?? entry.action}
                    </p>
                    <span className={`rounded-full px-2 py-1 text-label-bold ${outcome.className}`}>
                      {outcome.label}
                    </span>
                  </div>

                  <p className="text-body-md text-on-surface-variant">
                    {actorName(entry)} · {new Date(entry.at).toLocaleString('tr-TR')}
                    {entry.ip ? ` · ${entry.ip}` : ''}
                  </p>

                  {meta && (
                    <p className="mt-1 font-mono text-label-sm break-all text-outline">{meta}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 && (
          <nav className="mt-lg flex items-center justify-between gap-sm">
            <PageLink
              label="Önceki"
              href={`/isletme/gunluk?${new URLSearchParams({
                ...(action ? { eylem: action } : {}),
                sayfa: String(page - 1),
              })}`}
              disabled={page <= 1}
            />
            <span className="text-body-md text-on-surface-variant">
              {page} / {pages} · {total} kayıt
            </span>
            <PageLink
              label="Sonraki"
              href={`/isletme/gunluk?${new URLSearchParams({
                ...(action ? { eylem: action } : {}),
                sayfa: String(page + 1),
              })}`}
              disabled={page >= pages}
            />
          </nav>
        )}
      </main>
    </div>
  );
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-2 text-label-bold whitespace-nowrap ${
        active
          ? 'border-primary bg-primary text-on-primary'
          : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'
      }`}
    >
      {label}
    </Link>
  );
}

function PageLink({
  label,
  href,
  disabled,
}: {
  label: string;
  href: string;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <span className="rounded-lg border border-outline-variant px-4 py-2 text-label-bold text-outline opacity-50">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-outline-variant px-4 py-2 text-label-bold text-on-surface-variant"
    >
      {label}
    </Link>
  );
}
