import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OperatorNav } from '@/components/OperatorNav';
import { Icon } from '@/components/Icon';
import { CARD, weekdayMaskLabel } from '@/components/form';
import { requireOperatorPage } from '@/lib/auth';
import { getActivityById } from '@/lib/db/activities';
import { loadPricing } from '@/lib/db/pricing';
import { onlinePaymentFor } from '@/lib/payments/flow';
import { formatPrice } from '@/lib/format';
import {
  DeleteGroupDiscountButton,
  DeletePriceRuleButton,
  DepositForm,
  GroupDiscountForm,
  PriceRuleForm,
} from './PricingForms';

export const metadata: Metadata = {
  title: 'Fiyatlandırma',
  robots: { index: false, follow: false },
};

/** "01.06–15.09", "01.06'dan itibaren", "15.09'a kadar" ya da boş. */
function seasonLabel(from: string | null, until: string | null): string | null {
  const short = (iso: string) => iso.slice(8, 10) + '.' + iso.slice(5, 7);
  if (from && until) return `${short(from)}–${short(until)}`;
  if (from) return `${short(from)}'dan itibaren`;
  if (until) return `${short(until)}'a kadar`;
  return null;
}

/**
 * Sezon, gün ve saat bazlı fiyat + grup indirimi.
 *
 * İşletmenin bugüne kadar tek bir fiyatı vardı ve gerçek hayatta öyle
 * çalışmıyor: temmuz cumartesi öğleden sonrası ile mayıs salı sabahı aynı
 * fiyata satılmıyor. Kural yazılamayınca işletme ya ortalama bir fiyat koyup
 * yoğun saatte para bırakıyor ya da yüksek koyup boş saati boş bırakıyordu.
 */
export default async function PricingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperatorPage('aktivite.yonet');

  const { id } = await params;
  const activity = await getActivityById(id);
  if (!activity || activity.operatorId !== session.operator.id) notFound();

  const { rules, discounts } = await loadPricing(activity.id);

  // Kapora ancak online tahsilat varsa gerçekten alınabiliyor; ekran bunu
  // saklamak yerine söylüyor.
  const payment = await onlinePaymentFor(activity.operatorId);

  return (
    <div className="min-h-screen">
      <OperatorNav session={session} />

      <main className="mx-auto flex max-w-[48rem] flex-col gap-lg px-container-margin py-lg">
        <div>
          <Link
            href={`/isletme/aktiviteler/${activity.id}`}
            className="mb-sm inline-flex items-center gap-1 text-label-bold text-on-surface-variant"
          >
            <Icon name="arrow_back" size={18} />
            {activity.title}
          </Link>
          <h1 className="text-headline-md text-on-background">Fiyatlandırma</h1>
          <p className="text-body-md text-on-surface-variant">
            Liste fiyatı <strong>{formatPrice(activity.priceTRY)}</strong> / kişi. Aşağıdaki
            kurallar bu fiyatın yerine geçer; hiçbiri uymuyorsa liste fiyatı geçerlidir.
          </p>
        </div>

        <section className={CARD}>
          <h2 className="mb-md text-headline-sm text-on-surface">Yeni fiyat kuralı</h2>
          <PriceRuleForm activityId={activity.id} />
        </section>

        <section className={CARD}>
          <h2 className="mb-xs text-headline-sm text-on-surface">Tanımlı kurallar</h2>
          <p className="mb-md text-body-md text-on-surface-variant">
            Sıra <strong>değerlendirme sırasıdır</strong>: yukarıdan aşağı bakılır, uyan{' '}
            <strong>ilk kural</strong> geçerli olur.
          </p>

          {rules.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">
              Kural yok — her saat liste fiyatından satılıyor.
            </p>
          ) : (
            <ol className="flex flex-col gap-sm">
              {rules.map((rule) => {
                const season = seasonLabel(rule.validFrom, rule.validUntil);
                return (
                  <li
                    key={rule.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-body-md font-semibold text-on-surface">
                        {rule.label} · {formatPrice(rule.priceTRY)} / kişi
                      </p>
                      <p className="text-label-sm text-on-surface-variant">
                        {weekdayMaskLabel(rule.weekdays)}
                        {season && ` · ${season}`}
                        {(rule.startTime || rule.endTime) &&
                          ` · ${rule.startTime ?? '00:00'}–${rule.endTime ?? '24:00'}`}
                        {rule.priority > 0 && ` · öncelik ${rule.priority}`}
                      </p>
                    </div>
                    <DeletePriceRuleButton activityId={activity.id} id={rule.id} />
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className={CARD}>
          <h2 className="mb-xs text-headline-sm text-on-surface">Grup indirimi</h2>
          <p className="mb-md text-body-md text-on-surface-variant">
            Kişi sayısının geçtiği <strong>en yüksek eşik</strong> uygulanır ve yalnızca biri —
            indirimler üst üste binmez.
          </p>

          <GroupDiscountForm activityId={activity.id} />

          {discounts.length > 0 && (
            <ul className="mt-md flex flex-col gap-sm">
              {discounts.map((discount) => (
                <li
                  key={discount.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant p-3"
                >
                  <span className="text-body-md text-on-surface">
                    {discount.minPeople}+ kişi · %{discount.percent} indirim
                  </span>
                  <DeleteGroupDiscountButton activityId={activity.id} id={discount.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={CARD}>
          <h2 className="mb-xs text-headline-sm text-on-surface">Kapora</h2>
          <p className="mb-md text-body-md text-on-surface-variant">
            Müşteri rezervasyon sırasında tutarın bu kadarını öder, kalanını tesiste. Gelmeyen
            müşterinin maliyeti sizde kalmasın diye var: tesiste ödemeli rezervasyonda
            &quot;gelmedim&quot; bedava ve insanlar üç yere birden yazılıyor.
          </p>
          <p className="mb-md text-body-md text-on-surface-variant">
            Boş bırakırsanız kapora alınmaz — tutarın tamamı rezervasyonda tahsil edilir.
            <strong> Değişiklik yalnızca bundan sonraki rezervasyonlar için geçerlidir</strong>;
            tahsil edilmiş kaporalar olduğu gibi kalır.
          </p>

          <DepositForm activityId={activity.id} depositPercent={activity.depositPercent} />

          {!payment.available && (
            <p className="mt-md rounded-lg bg-surface-container px-3 py-2 text-body-md text-on-surface-variant">
              Online ödeme henüz açık değil, bu yüzden kapora <strong>tahsil edilmiyor</strong>.
              Oranı şimdiden kaydedebilirsiniz; ödeme ayarları tamamlandığında devreye girer.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
