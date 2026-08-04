import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { LEGAL_DOCUMENTS, getLegalDocument, renderLegalDocument } from '@/lib/legal';

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((d) => ({ belge: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ belge: string }>;
}): Promise<Metadata> {
  const { belge } = await params;
  const document = getLegalDocument(belge);
  if (!document) return {};

  const { isDraft } = renderLegalDocument(document);

  return {
    title: document.title,
    description: document.description,
    // Taslak metin arama motorlarında görünmemeli.
    robots: isDraft ? { index: false, follow: false } : undefined,
  };
}

export default async function LegalPage({ params }: { params: Promise<{ belge: string }> }) {
  const { belge } = await params;
  const document = getLegalDocument(belge);
  if (!document) notFound();

  const { html, isDraft } = renderLegalDocument(document);

  return (
    <div className="min-h-screen px-container-margin py-lg">
      <div className="mx-auto max-w-[45rem]">
        <Link
          href="/"
          className="mb-lg inline-flex items-center gap-2 text-label-bold text-on-surface-variant"
        >
          <Icon name="arrow_back" size={18} />
          Ana sayfa
        </Link>

        {isDraft && (
          <div
            role="alert"
            className="mb-lg rounded-xl border border-error-container bg-error-container p-md text-on-error-container"
          >
            <p className="mb-xs flex items-center gap-2 text-headline-sm">
              <Icon name="security" size={20} />
              Bu metin taslaktır
            </p>
            <p className="text-body-md">
              Hukukçu incelemesi tamamlanmadı ve bağlayıcı değildir. Sorularınız için bize
              ulaşabilirsiniz.
            </p>
          </div>
        )}

        <article
          className="legal-prose text-body-lg text-on-surface"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <nav className="mt-xl border-t border-outline-variant pt-lg">
          <p className="mb-sm text-label-bold text-on-surface-variant">Diğer metinler</p>
          <ul className="flex flex-col gap-1">
            {LEGAL_DOCUMENTS.filter((d) => d.slug !== document.slug).map((d) => (
              <li key={d.slug}>
                <Link href={`/${d.slug}`} className="text-body-md text-primary hover:underline">
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
