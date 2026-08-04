import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { currentUserId } from '@/lib/auth';
import { getUser } from '@/lib/db/users';
import { listBookingsForUser } from '@/lib/db/bookings';
import { DeleteAccountForm } from './DeleteAccountForm';

export const metadata: Metadata = {
  title: 'Hesabım',
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const userId = await currentUserId();
  if (!userId) redirect('/rezervasyonlarim');

  const user = getUser(userId);
  if (!user || user.deletedAt) redirect('/');

  const bookings = listBookingsForUser(userId);
  const active = bookings.filter((b) => b.status === 'confirmed');

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 border-b border-surface-variant bg-surface px-container-margin">
        <Link href="/rezervasyonlarim" aria-label="Geri" className="text-on-surface-variant">
          <Icon name="arrow_back" size={24} />
        </Link>
        <h1 className="text-headline-sm text-primary">Hesabım</h1>
      </header>

      <main className="mx-auto max-w-[32rem] px-container-margin py-lg">
        <section className="mb-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
          <h2 className="mb-sm text-headline-sm text-on-surface">Bilgileriniz</h2>
          <dl className="flex flex-col gap-2 text-body-md">
            <Row label="Ad soyad" value={user.name} />
            <Row label="Telefon" value={user.phone} />
            <Row
              label="Kayıt"
              value={new Date(user.createdAt).toLocaleDateString('tr-TR')}
            />
            <Row label="Rezervasyon" value={`${bookings.length} kayıt`} />
          </dl>
        </section>

        <section className="mb-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
          <h2 className="mb-xs text-headline-sm text-on-surface">Verilerinizi indirin</h2>
          <p className="mb-md text-body-md text-on-surface-variant">
            Sistemde sizinle ilgili tutulan her şeyi JSON dosyası olarak indirebilirsiniz:
            hesap bilgileriniz, tüm rezervasyonlarınız ve güvenlik amacıyla tutulan işlem
            kayıtları.
          </p>
          {/*
            Sunucu eylemi değil, doğrudan bağlantı: dosyanın indirilebilmesi için
            Content-Disposition başlığı gerekiyor.
          */}
          <a
            href="/hesabim/verilerim"
            download
            className="inline-flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-label-bold text-primary"
          >
            <Icon name="share" size={18} />
            Verilerimi İndir (JSON)
          </a>
        </section>

        <section className="rounded-xl border border-error bg-surface-container-lowest p-md shadow-card">
          <h2 className="mb-xs text-headline-sm text-on-surface">Hesabımı sil</h2>
          <p className="mb-sm text-body-md text-on-surface-variant">
            Adınız ve telefon numaranız geri döndürülemez biçimde kaldırılır. Bundan sonra
            hiçbir kayıt sizi işaret etmez.
          </p>
          <p className="mb-md text-body-md text-on-surface-variant">
            Geçmiş rezervasyon kayıtları <strong>anonim hâlde</strong> kalır: yasal
            zamanaşımı süresince tutulmaları gerekiyor. Bu kayıtlarda artık adınız ve
            numaranız yer almaz.
          </p>

          <DeleteAccountForm activeCount={active.length} />
        </section>

        <p className="mt-lg text-label-sm text-on-surface-variant">
          Diğer haklarınız (düzeltme, itiraz) için{' '}
          <Link href="/kvkk-basvuru" className="text-primary underline">
            KVKK başvuru formu
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="text-right font-medium text-on-surface">{value}</dd>
    </div>
  );
}
