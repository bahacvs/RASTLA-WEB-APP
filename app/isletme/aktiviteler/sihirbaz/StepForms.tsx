'use client';

import { useActionState, useState } from 'react';
import {
  wizardBasicsAction,
  wizardLocationAction,
  wizardPublishAction,
  wizardScheduleAction,
  type WizardState,
} from '@/app/actions/activity-wizard';
import { CATEGORIES, type ActivityCategory } from '@/lib/catalog';
import { timesForRule } from '@/lib/schedule-times.mjs';
import { SUGGESTED_LIMITS } from '@/lib/weather/limits.mjs';
import { FIELD, LABEL, PRIMARY_BUTTON, TEXTAREA } from '@/components/form';

/**
 * Sihirbazın adım formları.
 *
 * Hepsi tek dosyada çünkü paylaştıkları şey çok: aynı hata kutusu, aynı
 * gönderim düğmesi, aynı gizli `aktivite` alanı. Ayrı dosyalara bölünselerdi
 * bu üçü de üç kez yazılırdı.
 */

function ErrorBox({ state }: { state: WizardState }) {
  if (!state.error) return null;
  return (
    <p
      role="alert"
      className="mt-sm rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container"
    >
      {state.error}
    </p>
  );
}

/**
 * `pending` ile `disabled` AYRI.
 *
 * Önce ikisi tek değişkendi ve düğme, hiçbir şey kaydedilmezken
 * "Kaydediliyor…" yazıyordu: eksik adım yüzünden kapalı olan düğme kendini
 * çalışıyormuş gibi gösteriyordu. Kullanıcı beklemeye başlardı.
 */
function Submit({
  pending,
  disabled,
  label,
}: {
  pending: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`mt-md ${PRIMARY_BUTTON}`}
    >
      {pending ? 'Kaydediliyor…' : label}
    </button>
  );
}

// ------------------------------------------------------------------ 1. temel

export function BasicsStep({
  activityId,
  defaults,
}: {
  activityId?: string;
  defaults?: {
    title: string;
    category: ActivityCategory;
    priceTRY: number;
    durationMinutes: number;
    capacityMode: string;
  };
}) {
  const [state, action, pending] = useActionState<WizardState, FormData>(wizardBasicsAction, {});

  return (
    <form action={action}>
      {/* Geri dönüp düzeltmek yeni bir taslak açmasın diye kimlik taşınıyor. */}
      {activityId && <input type="hidden" name="aktivite" value={activityId} />}

      <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="title" className={LABEL}>
            Aktivite adı
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            minLength={3}
            defaultValue={defaults?.title}
            placeholder="Sabah SUP Turu"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="category" className={LABEL}>
            Kategori
          </label>
          <select
            id="category"
            name="category"
            required
            defaultValue={defaults?.category ?? ''}
            className={FIELD}
          >
            <option value="" disabled>
              Seçin
            </option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="durationMinutes" className={LABEL}>
            Süre (dakika)
          </label>
          <input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={5}
            step={5}
            required
            defaultValue={defaults?.durationMinutes ?? 60}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="priceTRY" className={LABEL}>
            Kişi başı fiyat (TL)
          </label>
          <input
            id="priceTRY"
            name="priceTRY"
            type="number"
            min={0}
            required
            defaultValue={defaults?.priceTRY}
            className={FIELD}
          />
        </div>

        <fieldset className="sm:col-span-2">
          <legend className={LABEL}>Kapasite nasıl sayılsın?</legend>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex flex-1 items-start gap-2 rounded-lg border border-outline-variant p-3">
              <input
                type="radio"
                name="capacityMode"
                value="per_person"
                defaultChecked={(defaults?.capacityMode ?? 'per_person') === 'per_person'}
                className="mt-1"
              />
              <span className="text-body-md text-on-surface">
                <strong>Kişi sayılır</strong>
                <span className="block text-on-surface-variant">
                  8 kişilik seansa 3 kişilik rezervasyon 3 yer düşer.
                </span>
              </span>
            </label>
            <label className="flex flex-1 items-start gap-2 rounded-lg border border-outline-variant p-3">
              <input
                type="radio"
                name="capacityMode"
                value="per_booking"
                defaultChecked={defaults?.capacityMode === 'per_booking'}
                className="mt-1"
              />
              <span className="text-body-md text-on-surface">
                <strong>Rezervasyon sayılır</strong>
                <span className="block text-on-surface-variant">
                  Kaç kişi olursa olsun bir tekne/araç düşer.
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      </div>

      <ErrorBox state={state} />
      <Submit pending={pending} label="Devam et" />
    </form>
  );
}

// ------------------------------------------------------------------ 2. konum

export function LocationStep({
  activityId,
  defaults,
}: {
  activityId: string;
  defaults?: { location: string; lat: number | null; lng: number | null; description?: string };
}) {
  const [state, action, pending] = useActionState<WizardState, FormData>(wizardLocationAction, {});

  return (
    <form action={action}>
      <input type="hidden" name="aktivite" value={activityId} />

      <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="location" className={LABEL}>
            Buluşma yeri
          </label>
          <input
            id="location"
            name="location"
            type="text"
            required
            defaultValue={defaults?.location}
            placeholder="Büyükçekmece Sahili"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="lat" className={LABEL}>
            Enlem <span className="font-normal">(isteğe bağlı)</span>
          </label>
          <input
            id="lat"
            name="lat"
            inputMode="decimal"
            defaultValue={defaults?.lat ?? ''}
            placeholder="41.0155"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="lng" className={LABEL}>
            Boylam <span className="font-normal">(isteğe bağlı)</span>
          </label>
          <input
            id="lng"
            name="lng"
            inputMode="decimal"
            defaultValue={defaults?.lng ?? ''}
            placeholder="28.5862"
            className={FIELD}
          />
        </div>

        <p className="text-body-md text-on-surface-variant sm:col-span-2">
          Koordinat girerseniz müşteri haritada görür ve tek dokunuşla yol tarifi alır.
        </p>

        <div className="sm:col-span-2">
          <label htmlFor="description" className={LABEL}>
            Açıklama <span className="font-normal">(isteğe bağlı)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={defaults?.description}
            placeholder="Deneyimin nasıl geçtiğini kısaca anlatın."
            className={TEXTAREA}
          />
        </div>
      </div>

      <ErrorBox state={state} />
      <Submit pending={pending} label="Devam et" />
    </form>
  );
}

// ----------------------------------------------------------------- 3. takvim

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function ScheduleStep({
  activityId,
  category,
}: {
  activityId: string;
  category: string;
}) {
  const [state, action, pending] = useActionState<WizardState, FormData>(wizardScheduleAction, {});

  // Kategoriye göre ÖNERİ. Boş bırakılırsa o ölçüm hiç kontrol edilmez;
  // varsayılan olarak bir sınır doldurmak, hiç düşünmemiş bir işletmenin
  // gününü uydurma bir eşik yüzünden riskli göstermek olurdu.
  const suggested = SUGGESTED_LIMITS[category] ?? null;

  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [interval, setIntervalMinutes] = useState(60);
  const [capacity, setCapacity] = useState(8);
  const [prep, setPrep] = useState(0);

  // Önizleme, sunucunun slotları üretirken kullandığı fonksiyonun AYNISI.
  // Ayrı bir formül tutulduğunda hazırlık payı unutulmuş ve kullanıcıya
  // üretilecek olandan fazla slot vaat edilmişti.
  const perDay = timesForRule(
    { startTime: start, endTime: end, intervalMinutes: interval },
    prep
  ).length;

  return (
    <form action={action}>
      <input type="hidden" name="aktivite" value={activityId} />

      <div className="grid grid-cols-2 gap-sm sm:grid-cols-4">
        <div>
          <label htmlFor="startTime" className={LABEL}>
            Başlangıç
          </label>
          <input
            id="startTime"
            name="startTime"
            type="time"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="endTime" className={LABEL}>
            Bitiş
          </label>
          <input
            id="endTime"
            name="endTime"
            type="time"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="intervalMinutes" className={LABEL}>
            Kaç dakikada bir
          </label>
          <input
            id="intervalMinutes"
            name="intervalMinutes"
            type="number"
            min={5}
            step={5}
            required
            value={interval}
            onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="capacity" className={LABEL}>
            Seans kapasitesi
          </label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            required
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            className={FIELD}
          />
        </div>
      </div>

      <fieldset className="mt-md">
        <legend className={LABEL}>Hangi günler?</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((label, i) => (
            <label
              key={label}
              className="flex items-center gap-1 rounded-full border border-outline-variant px-3 py-2 text-label-bold text-on-surface-variant"
            >
              <input type="checkbox" name={`weekday-${i}`} defaultChecked />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Hiçbiri seçilmezse her gün kabul edilir.
        </p>
      </fieldset>

      <div className="mt-md grid grid-cols-1 gap-sm sm:grid-cols-3">
        <div>
          <label htmlFor="minParticipants" className={LABEL}>
            Minimum katılımcı
          </label>
          <input
            id="minParticipants"
            name="minParticipants"
            type="number"
            min={1}
            defaultValue={1}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="bookingCutoffMinutes" className={LABEL}>
            Son rezervasyon (dk önce)
          </label>
          <input
            id="bookingCutoffMinutes"
            name="bookingCutoffMinutes"
            type="number"
            min={0}
            defaultValue={0}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="prepMinutes" className={LABEL}>
            Hazırlık payı (dk)
          </label>
          <input
            id="prepMinutes"
            name="prepMinutes"
            type="number"
            min={0}
            value={prep}
            onChange={(e) => setPrep(Number(e.target.value))}
            className={FIELD}
          />
        </div>
      </div>

      <div className="mt-md rounded-lg border border-outline-variant p-3">
        <p className={LABEL}>Ekipman havuzu (isteğe bağlı)</p>
        <p className="mb-sm text-body-md text-on-surface-variant">
          Sınırı kişi sayısı değil araç sayısı koyuyorsa doldurun: 3 jet ski, araç başına 2 kişi.
        </p>
        <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
          <input name="poolName" type="text" placeholder="Jet ski" className={FIELD} />
          <input name="unitCount" type="number" min={1} placeholder="Kaç adet" className={FIELD} />
          <input
            name="capacityPerUnit"
            type="number"
            min={1}
            placeholder="Araç başına kişi"
            className={FIELD}
          />
        </div>
      </div>

      <div className="mt-md rounded-lg border border-outline-variant p-3">
        <p className={LABEL}>Hava sınırları (isteğe bağlı)</p>
        <p className="mb-sm text-body-md text-on-surface-variant">
          Aşağıdaki değerler <strong>öneridir</strong>, taahhüt değil: güvenli sınırı ekipmanınız,
          eğitmeniniz ve koyunuz belirler. Boş bıraktığınız ölçüm hiç kontrol edilmez. Sınır
          aşıldığında <strong>hiçbir şey otomatik iptal edilmez</strong> — gün panelde işaretlenir
          ve karar sizin olur.
        </p>
        <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
          <div>
            <label htmlFor="windLimitKmh" className={LABEL}>
              Rüzgâr (km/s)
            </label>
            <input
              id="windLimitKmh"
              name="windLimitKmh"
              type="number"
              min={1}
              step={1}
              defaultValue={suggested?.wind ?? ''}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="gustLimitKmh" className={LABEL}>
              Rüzgâr darbesi (km/s)
            </label>
            <input
              id="gustLimitKmh"
              name="gustLimitKmh"
              type="number"
              min={1}
              step={1}
              defaultValue={suggested?.gust ?? ''}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="waveLimitM" className={LABEL}>
              Dalga (m)
            </label>
            <input
              id="waveLimitM"
              name="waveLimitM"
              type="number"
              min={0.1}
              step={0.1}
              defaultValue={suggested?.wave ?? ''}
              className={FIELD}
            />
          </div>
        </div>
      </div>

      <p className="mt-md text-body-md text-on-surface-variant">
        {perDay > 0 ? (
          <>
            Bu kural günde <strong className="text-on-surface">{perDay} seans</strong> üretir, her
            biri <strong className="text-on-surface">{capacity} kapasiteli</strong> — günlük toplam{' '}
            <strong className="text-on-surface">{perDay * capacity} yer</strong>.
            {prep > 0 && ` Hazırlık payı dahil: ${interval + prep} dakikada bir kalkış.`}
          </>
        ) : (
          'Bitiş saati başlangıçtan sonra olmalı.'
        )}
      </p>

      <ErrorBox state={state} />
      <Submit pending={pending} disabled={perDay === 0} label="Takvimi Oluştur" />
    </form>
  );
}

// ---------------------------------------------------------------- 5. yayına al

export function PublishStep({
  activityId,
  missing,
}: {
  activityId: string;
  missing: string[];
}) {
  const [state, action, pending] = useActionState<WizardState, FormData>(wizardPublishAction, {});

  return (
    <form action={action}>
      <input type="hidden" name="aktivite" value={activityId} />
      <ErrorBox state={state} />
      <Submit
        pending={pending}
        disabled={missing.length > 0}
        label={missing.length > 0 ? 'Önce eksikleri tamamlayın' : 'Yayına Al'}
      />
    </form>
  );
}
