'use client';

import { useActionState } from 'react';
import {
  createActivityAction,
  updateActivityAction,
  type ActivityFormState,
} from '@/app/actions/activity';
import { CATEGORIES } from '@/lib/catalog';
import type { Activity } from '@/lib/catalog';

const FIELD =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none';
const LABEL = 'mb-1 block text-label-bold text-on-surface-variant';

/**
 * Aktivite ekleme/düzenleme formu.
 *
 * Fotoğraf yükleme bu fazda yok; görseller RASTLA tarafından eklenir.
 * İşletme metin alanlarını, fiyatı, süreyi, konumu ve kapasite biçimini yönetir.
 */
export function ActivityForm({ activity }: { activity?: Activity }) {
  const editing = Boolean(activity);
  const [state, action, pending] = useActionState<ActivityFormState, FormData>(
    editing ? updateActivityAction : createActivityAction,
    {}
  );

  return (
    <form action={action} className="flex flex-col gap-lg">
      {activity && <input type="hidden" name="id" value={activity.id} />}

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
        <h2 className="mb-md text-headline-sm text-on-surface">Temel Bilgiler</h2>

        <div className="flex flex-col gap-sm">
          <div>
            <label className={LABEL} htmlFor="title">
              Aktivite adı
            </label>
            <input
              id="title"
              name="title"
              required
              minLength={3}
              defaultValue={activity?.title}
              className={FIELD}
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="category">
              Kategori
            </label>
            <select
              id="category"
              name="category"
              required
              defaultValue={activity?.category ?? ''}
              className={FIELD}
            >
              <option value="" disabled>
                Seçin
              </option>
              {CATEGORIES.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL} htmlFor="description">
              Açıklama
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={activity?.description}
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-sm">
            <div>
              <label className={LABEL} htmlFor="priceTRY">
                Kişi başı fiyat (TL)
              </label>
              <input
                id="priceTRY"
                name="priceTRY"
                type="number"
                min={0}
                required
                defaultValue={activity?.priceTRY}
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="durationMinutes">
                Süre (dakika)
              </label>
              <input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                min={5}
                step={5}
                required
                defaultValue={activity?.durationMinutes ?? 60}
                className={FIELD}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
        <h2 className="mb-xs text-headline-sm text-on-surface">Kapasite</h2>
        <p className="mb-md text-body-md text-on-surface-variant">
          Bir slottaki yerin neye göre sayılacağını siz belirlersiniz — hangi araca kaç kişi
          güvenli sığar, bunu en iyi siz bilirsiniz.
        </p>

        <div className="flex flex-col gap-sm">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant p-3">
            <input
              type="radio"
              name="capacityMode"
              value="per_person"
              defaultChecked={(activity?.capacityMode ?? 'per_person') === 'per_person'}
              className="mt-1"
            />
            <span>
              <span className="block text-body-md font-semibold text-on-surface">Kişi sayılır</span>
              <span className="block text-body-md text-on-surface-variant">
                4 kapasiteli bir slot 4 KİŞİ alır. 2 kişilik rezervasyon 2 yer düşürür. Grup turu ve
                SUP için uygundur.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant p-3">
            <input
              type="radio"
              name="capacityMode"
              value="per_booking"
              defaultChecked={activity?.capacityMode === 'per_booking'}
              className="mt-1"
            />
            <span>
              <span className="block text-body-md font-semibold text-on-surface">
                Rezervasyon sayılır
              </span>
              <span className="block text-body-md text-on-surface-variant">
                4 kapasiteli bir slot 4 REZERVASYON alır. 2 kişilik rezervasyon 1 yer düşürür. Her
                müşteriye bir araç düşen jet ski gibi durumlar için uygundur.
              </span>
            </span>
          </label>

          <div>
            <label className={LABEL} htmlFor="capacityLabel">
              Kapasite açıklaması (isteğe bağlı)
            </label>
            <input
              id="capacityLabel"
              name="capacityLabel"
              placeholder="1-5 Kişi"
              defaultValue={activity?.capacityLabel}
              className={FIELD}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name="instantConfirm"
              defaultChecked={activity?.instantConfirm}
            />
            <span className="text-body-md text-on-surface">Hemen onaylı (bekleme yok)</span>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
        <h2 className="mb-md text-headline-sm text-on-surface">Konum</h2>

        <div className="flex flex-col gap-sm">
          <div>
            <label className={LABEL} htmlFor="location">
              Konum adı
            </label>
            <input
              id="location"
              name="location"
              required
              placeholder="Büyükçekmece Sahili"
              defaultValue={activity?.location}
              className={FIELD}
            />
          </div>

          <div className="grid grid-cols-2 gap-sm">
            <div>
              <label className={LABEL} htmlFor="lat">
                Enlem
              </label>
              <input
                id="lat"
                name="lat"
                inputMode="decimal"
                placeholder="41.0182"
                defaultValue={activity?.lat ?? ''}
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="lng">
                Boylam
              </label>
              <input
                id="lng"
                name="lng"
                inputMode="decimal"
                placeholder="28.5795"
                defaultValue={activity?.lng ?? ''}
                className={FIELD}
              />
            </div>
          </div>

          <p className="text-label-sm text-on-surface-variant">
            Koordinat girilmezse aktivite haritada görünmez. Google Haritalar&apos;da noktaya sağ
            tıklayarak koordinatı kopyalayabilirsiniz.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
        <h2 className="mb-md text-headline-sm text-on-surface">Detaylar</h2>

        <div className="flex flex-col gap-sm">
          <div>
            <label className={LABEL} htmlFor="included">
              Neler dahil? (her satıra bir madde)
            </label>
            <textarea
              id="included"
              name="included"
              rows={3}
              defaultValue={activity?.included?.join('\n')}
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="safety">
              Güvenlik bilgileri (her satıra bir madde)
            </label>
            <textarea
              id="safety"
              name="safety"
              rows={3}
              defaultValue={activity?.safety?.join('\n')}
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>
        </div>
      </section>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary py-3 text-headline-sm text-on-primary transition-transform active:scale-95 disabled:opacity-50"
      >
        {pending ? 'Kaydediliyor…' : editing ? 'Değişiklikleri Kaydet' : 'Oluştur ve Takvime Geç'}
      </button>
    </form>
  );
}
