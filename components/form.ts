/**
 * Form alanlarının ortak sınıfları.
 *
 * Bu üç dizgi projede **on ayrı dosyada birebir kopyaydı** (`ActivityForm`,
 * `ScheduleForm`, `LimitsForm`, `ManualBookingForm`, `OperatorLoginForm`,
 * `TeamControls`, `PaymentForms`, `OperatorControls`, `PlatformLoginForm`,
 * `ilanlar/page`). Kopya olduğu sürece "odak halkasını biraz belirginleştir"
 * gibi tek satırlık bir tasarım değişikliği on yerde ayrı ayrı yapılmak
 * zorunda ve biri unutulduğunda fark yalnızca o ekranda görünüyor.
 *
 * Sınıf dizgisi olarak duruyorlar, bileşen olarak değil: mevcut formların
 * hepsi düz `<input>` kullanıyor ve bir `<Field>` bileşeni getirmek, bu turda
 * dokunulmayan dokuz dosyayı da değiştirmeyi gerektirirdi. Yeni kod buradan
 * okuyor; eski kopyalar dokunulmadan duruyor ve sıraları geldikçe buraya
 * bağlanacak.
 *
 * Saf veri: `'use client'` gerekmiyor, hem sunucu hem istemci bileşeni okuyor.
 */

export const FIELD =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none';

export const LABEL = 'mb-1 block text-label-bold text-on-surface-variant';

export const CARD =
  'rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card';

/** Çok satırlı alan: FIELD'in sabit yüksekliği burada işe yaramıyor. */
export const TEXTAREA =
  'w-full rounded-lg border border-outline-variant bg-surface p-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none';

export const PRIMARY_BUTTON =
  'rounded-lg bg-primary px-5 py-3 text-label-bold text-on-primary transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60';

export const GHOST_BUTTON =
  'rounded-lg border border-outline-variant px-5 py-3 text-label-bold text-on-surface-variant transition-transform active:scale-95';
