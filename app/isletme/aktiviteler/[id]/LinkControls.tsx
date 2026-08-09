'use client';

import { useActionState, useState } from 'react';
import { createLinkAction, toggleLinkAction, type LinkState } from '@/app/actions/booking-link';
import { FIELD, LABEL } from '@/components/form';

/** Linkin takabileceği kanallar — sunucudaki listeyle aynı. */
const SOURCES = [
  { id: 'link', label: 'Genel link' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

export function CreateLinkForm({ activityId }: { activityId: string }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(createLinkAction, {});

  return (
    <form action={action} className="flex flex-col gap-sm">
      <input type="hidden" name="activityId" value={activityId} />

      <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor={`label-${activityId}`} className={LABEL}>
            Bu link nerede kullanılacak?
          </label>
          <input
            id={`label-${activityId}`}
            name="label"
            type="text"
            required
            minLength={2}
            placeholder="Instagram bio"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={`source-${activityId}`} className={LABEL}>
            Kanal
          </label>
          <select id={`source-${activityId}`} name="source" defaultValue="link" className={FIELD}>
            {SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-body-md text-error">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-body-md text-primary">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg border border-outline-variant px-4 py-2 text-label-bold text-on-surface-variant disabled:opacity-60"
      >
        {pending ? 'Oluşturuluyor…' : 'Link Oluştur'}
      </button>
    </form>
  );
}

/**
 * Adresi panoya kopyalar.
 *
 * İşletme bu adresi Instagram'a yapıştıracak; elle yazdırmak sekiz karakterlik
 * bir kodda hata davetiyesi. Pano API'si yoksa metin seçilebilir olarak
 * kalıyor — düğme çalışmadığında kopyalamanın başka bir yolu olmalı.
 */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="rounded-lg border border-outline-variant px-3 py-1 text-label-bold text-on-surface-variant"
    >
      {copied ? 'Kopyalandı' : 'Kopyala'}
    </button>
  );
}

export function ToggleLinkButton({
  id,
  activityId,
  disabled,
}: {
  id: string;
  activityId: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<LinkState, FormData>(toggleLinkAction, {});

  if (state.message) {
    return <span className="text-label-sm text-on-surface-variant">{state.message}</span>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="disable" value={disabled ? '0' : '1'} />
      <button
        type="submit"
        disabled={pending}
        className="text-label-bold text-on-surface-variant hover:underline disabled:opacity-50"
      >
        {pending ? '…' : disabled ? 'Yeniden aç' : 'Kapat'}
      </button>
      {state.error && <span className="ml-2 text-label-sm text-error">{state.error}</span>}
    </form>
  );
}
