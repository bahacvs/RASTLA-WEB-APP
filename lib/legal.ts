import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

/**
 * Hukuki metinleri `legal/` klasöründen okur.
 *
 * Tek kaynak ilkesi: avukatın üzerinde çalıştığı markdown dosyaları ile
 * sitede yayımlanan metin aynı dosyadır. İkinci bir kopya tutulsaydı biri
 * güncellenip diğeri unutulurdu.
 */

export type LegalDocument = {
  slug: string;
  title: string;
  description: string;
  file: string;
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    slug: 'aydinlatma',
    title: 'Aydınlatma Metni',
    description: 'Kişisel verilerinizin hangi amaçla ve hangi hukuki sebeple işlendiği.',
    file: 'aydinlatma-metni.md',
  },
  {
    slug: 'gizlilik',
    title: 'Gizlilik Politikası',
    description: 'Hangi bilgilerinizi neden işlediğimizin sade anlatımı.',
    file: 'gizlilik-politikasi.md',
  },
  {
    slug: 'cerez-politikasi',
    title: 'Çerez Politikası',
    description: 'Kullanılan çerezler ve cihazınızda saklanan veriler.',
    file: 'cerez-politikasi.md',
  },
  {
    slug: 'kvkk-basvuru',
    title: 'KVKK Başvuru Formu',
    description: 'Kişisel verilerinize ilişkin haklarınızı kullanmak için.',
    file: 'kvkk-basvuru-formu.md',
  },
];

export function getLegalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug);
}

/** Metnin başındaki TASLAK uyarısı. Kaldırılana kadar sayfada bayrak gösterilir. */
const DRAFT_MARKER = 'TASLAK';

export type RenderedDocument = {
  html: string;
  /**
   * Metin hâlâ taslak mı. Hukukçu onayı geldiğinde markdown dosyasının
   * başındaki uyarı bloğu silinir ve sayfa kendiliğinden yayın hâline geçer —
   * ayrıca kod değişikliği gerekmez.
   */
  isDraft: boolean;
};

export function renderLegalDocument(document: LegalDocument): RenderedDocument {
  const raw = readFileSync(join(process.cwd(), 'legal', document.file), 'utf8');

  // Taslak uyarısı ve son güncelleme satırını içeren blok, sayfada gövde
  // metni olarak değil, ayrı bir bayrak olarak gösterilir.
  const lines = raw.split('\n');
  const isDraft = lines.slice(0, 8).some((l) => l.includes(DRAFT_MARKER));

  const body = isDraft
    ? lines.filter((l) => !l.trimStart().startsWith('>')).join('\n')
    : raw;

  return { html: marked.parse(body, { async: false }), isDraft };
}
