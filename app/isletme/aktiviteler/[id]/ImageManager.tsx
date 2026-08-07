'use client';

import Image from 'next/image';
import { useActionState } from 'react';
import {
  deleteImageAction,
  makeCoverAction,
  setAltAction,
  uploadImageAction,
  type ImageState,
} from '@/app/actions/activity-images';
import type { ActivityImage } from '@/lib/db/activity-images';
import { Icon } from '@/components/Icon';

const MAX_IMAGES = 8;

function Feedback({ state }: { state: ImageState }) {
  if (!state.error && !state.message) return null;

  return (
    <p
      role={state.error ? 'alert' : 'status'}
      className={`rounded-lg px-3 py-2 text-body-md ${
        state.error
          ? 'bg-error-container text-on-error-container'
          : 'bg-secondary-container text-on-secondary-container'
      }`}
    >
      {state.error ?? state.message}
    </p>
  );
}

function UploadForm({ activityId, full }: { activityId: string; full: boolean }) {
  const [state, action, pending] = useActionState<ImageState, FormData>(uploadImageAction, {});

  return (
    <form action={action} className="flex flex-col gap-sm">
      <label>
        <span className="mb-1 block text-label-bold text-on-surface-variant">Yeni görsel</span>
        <input
          type="file"
          name="file"
          // Tarayıcı seçicisini daraltır. GÜVENLİK DEĞİLDİR: sunucu dosyanın
          // gerçek sihirli baytlarına bakar, bu ipucuna değil.
          accept="image/jpeg,image/png,image/webp"
          required
          disabled={full || pending}
          className="w-full text-body-md text-on-surface file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-label-bold file:text-on-primary"
        />
      </label>

      <label>
        <span className="mb-1 block text-label-bold text-on-surface-variant">
          Görsel açıklaması
        </span>
        <input
          name="alt"
          maxLength={200}
          placeholder="Örn: Gün batımında koyda kürek çeken iki kişi"
          className="h-12 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
        />
        <span className="mt-1 block text-label-sm text-on-surface-variant">
          Görme engelli ziyaretçiler bu metni duyar; görsel yüklenemezse de o görünür.
        </span>
      </label>

      <input type="hidden" name="activityId" value={activityId} />

      <Feedback state={state} />

      <button
        type="submit"
        disabled={full || pending}
        className="h-12 rounded-lg bg-primary text-label-bold text-on-primary transition-transform active:scale-95 disabled:opacity-60"
      >
        {pending ? 'Yükleniyor…' : full ? 'Sınıra ulaşıldı' : 'Görseli yükle'}
      </button>
    </form>
  );
}

function ImageCard({ image, cover }: { image: ActivityImage; cover: boolean }) {
  const [removeState, removeAction, removing] = useActionState<ImageState, FormData>(
    deleteImageAction,
    {}
  );
  const [, coverAction, promoting] = useActionState<ImageState, FormData>(makeCoverAction, {});
  const [altState, altAction, savingAlt] = useActionState<ImageState, FormData>(setAltAction, {});

  return (
    <li className="flex flex-col gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-card">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-container">
        <Image
          src={`/gorsel/${image.id}`}
          alt={image.alt ?? ''}
          fill
          sizes="(max-width: 768px) 100vw, 22rem"
          className="object-cover"
        />
        {cover && (
          <span className="absolute top-2 left-2 rounded-full bg-primary px-2 py-1 text-label-bold text-on-primary">
            Kapak
          </span>
        )}
      </div>

      <p className="text-label-sm text-on-surface-variant">
        {image.width}×{image.height} · {Math.round(image.bytes / 1024)} KB
      </p>

      <form action={altAction} className="flex gap-2">
        <input type="hidden" name="imageId" value={image.id} />
        <input
          name="alt"
          defaultValue={image.alt ?? ''}
          maxLength={200}
          placeholder="Görsel açıklaması"
          className="h-10 min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface px-2 text-body-md text-on-surface"
        />
        <button
          type="submit"
          disabled={savingAlt}
          className="shrink-0 rounded-lg border border-outline-variant px-3 text-label-bold text-on-surface-variant disabled:opacity-60"
        >
          {savingAlt ? '…' : 'Kaydet'}
        </button>
      </form>

      {!image.alt && (
        <p className="text-label-sm text-tertiary">
          Açıklama eksik — erişilebilirlik için doldurun.
        </p>
      )}

      <Feedback state={altState} />
      <Feedback state={removeState} />

      <div className="flex items-center justify-between gap-2">
        {cover ? (
          <span className="text-label-sm text-on-surface-variant">Kapak görseli</span>
        ) : (
          <form action={coverAction}>
            <input type="hidden" name="imageId" value={image.id} />
            <button
              type="submit"
              disabled={promoting}
              className="text-label-bold text-primary hover:underline disabled:opacity-60"
            >
              Kapak yap
            </button>
          </form>
        )}

        <form action={removeAction}>
          <input type="hidden" name="imageId" value={image.id} />
          <button
            type="submit"
            disabled={removing}
            className="flex items-center gap-1 text-label-bold text-on-surface-variant hover:underline disabled:opacity-60"
          >
            <Icon name="close" size={16} />
            {removing ? 'Siliniyor…' : 'Sil'}
          </button>
        </form>
      </div>
    </li>
  );
}

export function ImageManager({
  activityId,
  images,
}: {
  activityId: string;
  images: ActivityImage[];
}) {
  return (
    <section className="flex flex-col gap-md">
      <div>
        <h2 className="mb-xs text-headline-sm text-on-surface">Görseller</h2>
        <p className="text-body-md text-on-surface-variant">
          Aktivite başına en fazla {MAX_IMAGES} görsel, her biri en fazla 6 MB. Yüklenen fotoğraf
          sunucuda yeniden kodlanır: <strong>konum ve cihaz bilgisi dahil tüm EXIF verisi
          silinir.</strong> Telefonla çekilmiş bir fotoğraf çekim koordinatını taşır; bu bilgi
          sizin adınıza yayımlanmamalı.
        </p>
      </div>

      {images.length > 0 && (
        <ul className="grid gap-md sm:grid-cols-2">
          {images.map((image, index) => (
            <ImageCard key={image.id} image={image} cover={index === 0} />
          ))}
        </ul>
      )}

      <UploadForm activityId={activityId} full={images.length >= MAX_IMAGES} />
    </section>
  );
}
