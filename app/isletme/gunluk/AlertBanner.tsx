'use client';

import { useActionState } from 'react';
import { Icon } from '@/components/Icon';
import { resolveAlertAction, type AlertState } from '@/app/actions/alerts';

export type OpenAlert = {
  id: string;
  at: string;
  rule: string;
  severity: string;
  summary: string;
};

const STYLES: Record<string, string> = {
  critical: 'border-error bg-error-container text-on-error-container',
  warning: 'border-outline-variant bg-tertiary-container text-on-tertiary-container',
  info: 'border-outline-variant bg-surface-container text-on-surface-variant',
};

const LEVEL: Record<string, string> = {
  critical: 'Kritik',
  warning: 'Uyarı',
  info: 'Bilgi',
};

/**
 * Kapatılmamış güvenlik uyarıları.
 *
 * Uyarı, ne olduğunu söyler ve günlüğe yönlendirir; **kimin, hangi adresten**
 * sorusunun cevabı burada değil, işlem günlüğünde. Kişisel veriyi ikinci bir
 * ekrana taşımamak bilinçli.
 */
export function AlertBanner({ alerts }: { alerts: OpenAlert[] }) {
  const [state, action, pending] = useActionState<AlertState, FormData>(resolveAlertAction, {});

  if (alerts.length === 0) return null;

  return (
    <section className="mb-lg flex flex-col gap-sm">
      <h2 className="text-headline-sm text-on-background">
        Açık güvenlik uyarısı ({alerts.length})
      </h2>

      {state.error && (
        <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container">
          {state.error}
        </p>
      )}

      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-start gap-3 rounded-xl border p-md ${STYLES[alert.severity] ?? STYLES.info}`}
        >
          <Icon name="warning" size={20} className="mt-0.5 shrink-0" />

          <div className="min-w-0 flex-1">
            <p className="text-body-md">
              <strong>{LEVEL[alert.severity] ?? alert.severity}:</strong> {alert.summary}
            </p>
            <p className="mt-1 text-label-sm opacity-80">
              {new Date(alert.at).toLocaleString('tr-TR')} · {alert.rule}
            </p>
          </div>

          <form action={action} className="shrink-0">
            <input type="hidden" name="alertId" value={alert.id} />
            <button
              type="submit"
              disabled={pending}
              className="text-label-bold underline disabled:opacity-60"
            >
              Gördüm
            </button>
          </form>
        </div>
      ))}
    </section>
  );
}
