import { IS_DEMO } from '@/lib/demo';

/**
 * Demo kipinde her sayfanın üstünde duran şerit.
 *
 * Kapatılabilir değil. Kapatılabilir olsaydı, kapatan kişi sonraki
 * gezinmelerde uydurma ilanları gerçek sanabilirdi — şeridin varlık sebebi tam
 * olarak bunu engellemek.
 */
export function DemoBanner() {
  if (!IS_DEMO) return null;

  return (
    <div
      role="note"
      className="bg-tertiary-container px-container-margin py-2 text-center text-label-bold text-on-tertiary-container"
    >
      TANITIM SÜRÜMÜ — işletmeler ve ilanlar uydurmadır, rezervasyonlar gerçek
      değildir ve ücret tahsil edilmez.
    </div>
  );
}
