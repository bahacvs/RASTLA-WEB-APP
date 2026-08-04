'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { redeemAction, type ScanState } from '@/app/actions/operator';

/**
 * `BarcodeDetector` her tarayıcıda yok (özellikle iOS Safari'de).
 * Desteklenmediğinde kullanıcı bilgilendirilir; elle kod girişi her cihazda
 * çalışan asıl yoldur.
 */
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export function ScanPanel() {
  const [state, action, pending] = useActionState<ScanState, FormData>(redeemAction, {
    status: 'idle',
  });

  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  /** Yalnızca donanımı bırakır — durum değiştirmediği için temizlikte güvenli. */
  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  /** Kullanıcı etkileşimlerinden çağrılır: donanımı bırakır ve arayüzü kapatır. */
  function closeCamera() {
    stopTracks();
    setCameraOn(false);
  }

  // Sayfadan ayrılırken kamerayı serbest bırak. Durum değiştirmez.
  useEffect(() => stopTracks, []);

  async function startCamera() {
    setCameraError(null);

    if (typeof window === 'undefined' || !window.BarcodeDetector) {
      setCameraError('Bu tarayıcı kamerayla QR okumayı desteklemiyor. Kodu elle girin.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraOn(true);

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0 && inputRef.current) {
            inputRef.current.value = codes[0].rawValue;
            // Okunan kod gönderilmeden önce kamera kapanır: aynı QR arka
            // arkaya tekrar okunup gereksiz istek üretmesin.
            closeCamera();
            formRef.current?.requestSubmit();
            return;
          }
        } catch {
          // Tek bir karede okuma başarısız olabilir; döngü devam eder.
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      closeCamera();
      setCameraError('Kameraya erişilemedi. Kodu elle girebilirsiniz.');
    }
  }

  return (
    <div className="flex flex-col gap-lg">
      {state.status !== 'idle' && <Result state={state} />}

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
        <h2 className="mb-md text-headline-sm text-on-surface">Bilet Okut</h2>

        <div className="mb-md">
          {cameraOn ? (
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} playsInline muted className="h-64 w-full object-cover" />
              <button
                type="button"
                onClick={closeCamera}
                className="absolute top-2 right-2 rounded-full bg-surface/90 px-3 py-1 text-label-bold text-on-surface"
              >
                Kapat
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startCamera}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary py-3 text-label-bold text-primary transition-transform active:scale-95"
            >
              <Icon name="search" size={20} />
              Kamerayla Okut
            </button>
          )}

          {cameraError && (
            <p className="mt-sm text-body-md text-on-surface-variant">{cameraError}</p>
          )}
        </div>

        <form ref={formRef} action={action} className="flex flex-col gap-sm">
          <label htmlFor="code" className="text-label-bold text-on-surface-variant">
            Bilet kodu
          </label>
          <input
            ref={inputRef}
            id="code"
            name="code"
            required
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className="h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 font-mono text-body-lg tracking-wider text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary py-3 text-headline-sm text-on-primary transition-transform active:scale-95 disabled:opacity-50"
          >
            {pending ? 'Kontrol ediliyor…' : 'Onayla'}
          </button>
        </form>

        <p className="mt-md text-label-sm text-on-surface-variant">
          Her bilet yalnızca bir kez onaylanabilir. Onaylanmış bir bilet ikinci kez okutulduğunda
          reddedilir.
        </p>
      </section>
    </div>
  );
}

function Result({ state }: { state: ScanState }) {
  const ok = state.status === 'success';

  return (
    <section
      role="status"
      aria-live="assertive"
      className={`rounded-xl border p-md shadow-card ${
        ok
          ? 'border-secondary-container bg-secondary-container text-on-secondary-container'
          : 'border-error-container bg-error-container text-on-error-container'
      }`}
    >
      <div className="mb-sm flex items-center gap-2">
        <Icon name={ok ? 'check_circle' : 'close'} filled size={28} />
        <p className="text-headline-sm">{ok ? 'Onaylandı' : 'Onaylanmadı'}</p>
      </div>

      <p className="mb-md text-body-lg">{state.message}</p>

      {state.booking && (
        <dl className="rounded-lg bg-surface-container-lowest p-md text-on-surface">
          <Row label="Aktivite" value={state.booking.activityTitle} />
          <Row label="Misafir" value={state.booking.customerName} />
          <Row label="Tarih" value={`${state.booking.date} · ${state.booking.time}`} />
          <Row label="Katılımcı" value={state.booking.party} />
          <Row label="Kod" value={state.booking.code} mono />
          {state.booking.redeemedAt && (
            <Row label="İlk kullanım" value={state.booking.redeemedAt} />
          )}
        </dl>
      )}
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-outline-variant/40 py-1.5 last:border-0">
      <dt className="text-body-md text-on-surface-variant">{label}</dt>
      <dd className={`text-body-md font-semibold ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
