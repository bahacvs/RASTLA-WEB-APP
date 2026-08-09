'use client';

import { switchOperatorAction } from '@/app/actions/membership';
import { ROLE_LABELS, type OperatorRole } from '@/lib/permissions';

export type SwitcherOption = {
  operatorId: string;
  operatorName: string;
  role: OperatorRole;
  primary: boolean;
};

/**
 * Birden çok işletmeye erişimi olan kişinin işletme seçicisi.
 *
 * **Tek işletmesi olana hiç gösterilmiyor.** Kullanıcıların ezici çoğunluğu
 * tek işletme işletiyor ve onlara seçilecek tek seçeneği olan bir menü
 * göstermek, panelin üstüne hiçbir işe yaramayan bir kutu koymak olurdu.
 *
 * Rol her seçenekte yazılı çünkü **rol işletme başına değişiyor**: kendi
 * işletmesinde sahip olan biri ortağının işletmesinde saha personeli olabilir
 * ve hangi yetkiyle gireceğini geçmeden önce görmeli.
 *
 * Seçim sunucuda doğrulanıyor (`switchOperatorAction`); bu liste yalnızca
 * kolaylık. Elle başka bir kimlik göndermek işe yaramaz.
 */
export function OperatorSwitcher({
  options,
  activeId,
}: {
  options: SwitcherOption[];
  activeId: string;
}) {
  if (options.length < 2) return null;

  return (
    <form action={switchOperatorAction} className="flex items-center gap-2">
      <label htmlFor="operatorId" className="sr-only">
        İşletme seç
      </label>
      <select
        id="operatorId"
        name="operatorId"
        defaultValue={activeId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-10 max-w-[14rem] rounded-lg border border-outline-variant bg-surface px-2 text-body-md text-on-surface"
      >
        {options.map((option) => (
          <option key={option.operatorId} value={option.operatorId}>
            {option.operatorName} · {ROLE_LABELS[option.role]}
            {option.primary ? ' (kendi işletmeniz)' : ''}
          </option>
        ))}
      </select>

      {/*
        JavaScript kapalıyken seçim yine yapılabilsin: `onChange` bir kolaylık,
        gönderim düğmesi ise garanti. Panelin tamamı sunucu bileşeni ve tek bir
        istemci kolaylığının çalışmaması yüzünden işletme değiştirilememesi
        kabul edilebilir bir sonuç değil.
      */}
      <noscript>
        <button
          type="submit"
          className="rounded-lg border border-outline-variant px-3 py-2 text-label-bold text-on-surface-variant"
        >
          Geç
        </button>
      </noscript>
    </form>
  );
}
