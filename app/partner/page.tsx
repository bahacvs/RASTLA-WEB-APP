import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { commissionPercentLabel } from '@/lib/commission.mjs';
import { PARTNER_CONTACT_EMAIL } from '@/lib/site';

const COMMISSION = commissionPercentLabel();

export const metadata: Metadata = {
  title: 'RASTLA Partner — Boş kontenjanını gelire dönüştür',
  description:
    'Kurulum ücreti yok, aylık ücret yok. Yalnızca RASTLA üzerinden gerçekleşen ' +
    'satıştan komisyon. Telefondan gelen rezervasyonlarınız ücretsiz.',
  alternates: { canonical: '/partner' },
};

/**
 * İşletme tarafının açılış sayfası.
 *
 * Metin bilinçli olarak **söz vermediğimiz hiçbir şeyi söylemiyor.** Satış
 * sayfalarının alışkanlığı "ilk ay bedava", "3 kat rezervasyon" gibi
 * doğrulanamaz cümleler kurmaktır; burada yazan her cümlenin arkasında
 * çalışan bir özellik var ve hepsi ürünün içinde görülebiliyor.
 *
 * Komisyon oranı `lib/commission.mjs` içinden geliyor, elle yazılmıyor: bu
 * sayfada yazan oranla fiilen kesilen oranın ayrışması ticari bir yanlış
 * beyan olurdu.
 */

const FEATURES = [
  {
    icon: 'calendar_today' as const,
    title: 'Bugün ne var, tek ekranda',
    body:
      'Panel açıldığında ilk gördüğünüz şey günün akışı: saat saat rezervasyonlar, ' +
      'kaç kişi geliyor, kim ödedi, kim ödemedi. Yanında ara, WhatsApp yaz, geldi ' +
      'işaretle düğmeleri.',
  },
  {
    icon: 'group' as const,
    title: 'Telefondan gelen müşteri de sisteme girer',
    body:
      'Elle rezervasyon açmak ÜCRETSİZ ve komisyonsuz. Sebebi tahsilat değil: ' +
      'deftere yazılan bir rezervasyon sistemde görünmezse aynı saate ikinci bir ' +
      'grup alınır. Bütün kanallarınız tek takvimde toplanır.',
  },
  {
    icon: 'check_circle' as const,
    title: 'Ekipman kapasitesi, hazırlık payı',
    body:
      'Üç jet ski, araç başına iki kişi — sınırı kişi sayısı değil araç sayısı ' +
      'koyar. Seanslar arasına hazırlık süresi koyabilir, son rezervasyon saatini ' +
      've minimum katılımcıyı belirleyebilirsiniz.',
  },
  {
    icon: 'security' as const,
    title: 'QR ile check-in, iki kez kullanılamaz',
    body:
      'Müşteri biletini gösterir, personeliniz okutur. Aynı bilet ikinci kez ' +
      'onaylanamaz; kimin onayladığı kayda geçer. İnternet olmadan da bilet ' +
      'müşterinin telefonunda açılır.',
  },
  {
    icon: 'person' as const,
    title: 'Ekibiniz için ayrı hesaplar',
    body:
      'Sahibi, yöneticisi ve saha personeli farklı şeyler görür. Sahadaki kişi ' +
      'bilet okutur ve günü görür; müşteri listesini indiremez, fiyat değiştiremez. ' +
      'Ayrılan çalışanın hesabı tek tıkla kapanır.',
  },
  {
    icon: 'star' as const,
    title: 'Hak edişinizi görürsünüz',
    body:
      'Bekleyen bakiye ile hak edilen bakiye ayrı gösterilir: ödeme alındığında ' +
      'para bloke edilir, hizmet verildiğinde serbest bırakılır. Mutabakat ' +
      'raporunu CSV olarak indirip muhasebecinize gönderirsiniz.',
  },
];

export default function PartnerPage() {
  return (
    <div className="min-h-screen pb-xl">
      <header className="border-b border-surface-variant bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-container-margin">
          <Link href="/" className="text-headline-sm font-semibold text-on-surface">
            RASTLA
          </Link>
          <Link href="/isletme" className="text-label-bold text-primary hover:underline">
            İşletme Girişi
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[64rem] px-container-margin">
        {/* Vaat */}
        <section className="py-xl">
          <h1 className="mb-md max-w-[30rem] text-headline-lg text-on-background">
            Boş kontenjanınızı gelire dönüştürün.
          </h1>
          <p className="mb-lg max-w-[36rem] text-body-lg text-on-surface-variant">
            RASTLA, Büyükçekmece ve çevresindeki su sporları işletmeleri için bir rezervasyon
            ve operasyon sistemi. Kurulum ücreti yok, aylık ücret yok — yalnızca RASTLA
            üzerinden gerçekleşen satıştan <strong className="text-on-surface">%{COMMISSION}</strong>{' '}
            komisyon alınır.
          </p>

          <div className="flex flex-wrap gap-sm">
            <a
              href={`mailto:${PARTNER_CONTACT_EMAIL}?subject=İşletme kaydı`}
              className="rounded-lg bg-primary px-5 py-3 text-label-bold text-on-primary transition-transform active:scale-95"
            >
              İşletmemi Kaydet
            </a>
            <a
              href={`mailto:${PARTNER_CONTACT_EMAIL}?subject=Demo talebi`}
              className="rounded-lg border border-outline-variant px-5 py-3 text-label-bold text-on-surface-variant transition-transform active:scale-95"
            >
              Demo Talep Et
            </a>
          </div>
        </section>

        {/* Ne kadar ödeyeceğim */}
        <section className="mb-xl rounded-xl border border-outline-variant bg-surface-container-lowest p-lg shadow-card">
          <h2 className="mb-md text-headline-md text-on-background">Ne kadar ödüyorum?</h2>
          <ul className="flex flex-col gap-sm text-body-md text-on-surface">
            <Line label="Kurulum ücreti" value="Yok" />
            <Line label="Aylık sabit ücret" value="Yok" />
            <Line label="Elle girdiğiniz rezervasyonlar" value="Ücretsiz" />
            <Line
              label="RASTLA üzerinden gerçekleşen satış"
              value={`%${COMMISSION} komisyon`}
            />
          </ul>
          <p className="mt-md text-body-md text-on-surface-variant">
            Komisyon yalnızca <strong className="text-on-surface">gerçekleşen</strong> satıştan
            alınır: iptal edilen ya da müşterinin gelmediği rezervasyonda komisyon doğmaz.
            Kendi müşterinizi kendi kanallarınızdan aldığınızda RASTLA&apos;ya hiçbir ödeme
            yapmazsınız.
          </p>
        </section>

        {/* Özellikler */}
        <section className="mb-xl">
          <h2 className="mb-lg text-headline-md text-on-background">Panelde ne var?</h2>
          <div className="grid grid-cols-1 gap-md md:grid-cols-2">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card"
              >
                <Icon name={feature.icon} size={24} className="mb-sm text-primary" />
                <h3 className="mb-xs text-headline-sm text-on-surface">{feature.title}</h3>
                <p className="text-body-md text-on-surface-variant">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Dürüst sınırlar */}
        <section className="mb-xl rounded-xl border border-outline-variant bg-surface-container-low p-lg">
          <h2 className="mb-md text-headline-md text-on-background">Henüz olmayanlar</h2>
          <p className="mb-sm text-body-md text-on-surface-variant">
            Sonradan öğrenmenizi istemediğimiz için baştan yazıyoruz:
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body-md text-on-surface-variant">
            <li>Muhasebe programı değil; komisyon faturası ayrıca düzenlenir.</li>
            <li>
              Hava durumuna göre <strong>otomatik iptal yok</strong> — ve olmayacak. Panel
              elverişsiz günleri işaretler, iptal ya da saat değiştirme kararını siz verirsiniz.
              Yanlış bir tahminin bedeli bir uyarı olmalı, iptal edilmiş bir gün değil.
            </li>
            <li>
              Otel ve acenteler için <strong>makine API&apos;si yok</strong>; portaldan giriş
              yapıp misafir adına yer tutuyorlar.
            </li>
            <li>
              Şube kırılımı operasyon içindir; <strong>hak ediş ve IBAN işletme düzeyinde</strong>{' '}
              kalır. Ayrı banka hesabı gereken lokasyon ayrı bir işletme olarak açılmalı.
            </li>
            <li>
              Müşteri bildirimleri SMS aboneliği tanımlanana kadar yalnızca sunucu günlüğüne
              düşer.
            </li>
          </ul>
        </section>

        {/* Nasıl başlıyorum */}
        <section className="mb-xl">
          <h2 className="mb-md text-headline-md text-on-background">Nasıl başlanır?</h2>
          <ol className="flex flex-col gap-sm text-body-md text-on-surface-variant">
            <Step n={1} title="Başvurun">
              İşletme adınız ve iletişim bilgilerinizle yazın. Aynı gün dönüş yapıyoruz.
            </Step>
            <Step n={2} title="Belgeleri paylaşın">
              Vergi levhası, IBAN ve yetkili kimliği. Ödeme altyapısı bunları zorunlu tutuyor.
            </Step>
            <Step n={3} title="Doğrulama">
              RASTLA işletmenizi doğrular. Doğrulanmış işletmelerin ilanlarında müşteriye
              rozet gösterilir.
            </Step>
            <Step n={4} title="Aktivitelerinizi ve takviminizi girin">
              &quot;08:00&apos;dan 18:00&apos;e, 15 dakikada bir, 4 kişi&quot; gibi bir kural
              yazın; slotlar kendiliğinden üretilsin.
            </Step>
          </ol>
        </section>

        <div className="flex flex-wrap items-center gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-lg shadow-card">
          <p className="flex-1 text-body-lg text-on-surface">
            Sorunuz varsa önce konuşalım. Kayıt için acele etmenize gerek yok.
          </p>
          <a
            href={`mailto:${PARTNER_CONTACT_EMAIL}?subject=İşletme kaydı`}
            className="rounded-lg bg-primary px-5 py-3 text-label-bold text-on-primary transition-transform active:scale-95"
          >
            İşletmemi Kaydet
          </a>
        </div>
      </main>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-surface-variant pb-sm last:border-0">
      <span className="text-on-surface-variant">{label}</span>
      <span className="font-semibold text-on-surface">{value}</span>
    </li>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-label-bold text-on-primary">
        {n}
      </span>
      <span>
        <strong className="text-on-surface">{title}.</strong> {children}
      </span>
    </li>
  );
}
