/**
 * Prototiplerde kullanılan Material Symbols ikonlarını yerel SVG verisine çevirir.
 *
 * Neden: prototipler ikonları Google Fonts üzerinden gelen değişken bir ikon
 * fontuyla çiziyordu. Uygulamanın dışa hiç istek atmaması gerektiği için
 * ikonlar @material-symbols/svg-400 paketinden alınıp repoya gömülür.
 *
 * Çıktı (components/icons/paths.ts) commit edilir; bu betiği yalnızca ikon
 * listesi değiştiğinde yeniden çalıştırın.
 *
 * Kullanım: npm run generate:icons
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SRC_DIR = join(process.cwd(), 'node_modules', '@material-symbols', 'svg-400', 'outlined');
const OUT_FILE = join(process.cwd(), 'components', 'icons', 'paths.ts');

/**
 * Prototiplerde geçen ikonlar.
 *
 * `fill: true` olanlar arayüzde dolu varyantla çiziliyor — prototipteki
 * `font-variation-settings: 'FILL' 1` kullanımlarının karşılığı. Her iki
 * varyantı da gereken ikonlar (ör. yıldız, kalp) için ikisi de üretilir.
 */
const ICONS = [
  { name: 'add' },
  { name: 'arrow_back' },
  { name: 'bolt', fill: true },
  { name: 'calendar_today' },
  { name: 'check_circle' },
  { name: 'chevron_left' },
  { name: 'chevron_right' },
  { name: 'close' },
  { name: 'directions' },
  // Prototipteki `favorite_border`, Material Symbols'te favorite ikonunun
  // outline varyantına karşılık gelir; dolu hâli favori eklenmiş durumu gösterir.
  { name: 'favorite', fill: true },
  { name: 'flash_on', fill: true },
  { name: 'group' },
  { name: 'home', fill: true },
  { name: 'kayaking' },
  { name: 'location_on', fill: true },
  { name: 'notifications' },
  { name: 'person', fill: true },
  { name: 'remove' },
  { name: 'rowing' },
  { name: 'sailing' },
  { name: 'schedule' },
  { name: 'search', fill: true },
  { name: 'security' },
  { name: 'share' },
  { name: 'speed' },
  { name: 'star', fill: true },
  { name: 'surfing' },
  { name: 'tune' },
  { name: 'verified', fill: true },
  { name: 'warning' },
  { name: 'water' },
];

/** SVG dosyasından yalnızca çizim içeriğini (path/g elemanları) çıkarır. */
async function extractBody(file) {
  const svg = await readFile(join(SRC_DIR, file), 'utf8');
  const match = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!match) throw new Error(`${file}: <svg> gövdesi ayrıştırılamadı`);

  const body = match[1].trim();
  if (!body) throw new Error(`${file}: boş gövde`);
  return body;
}

async function main() {
  await mkdir(join(process.cwd(), 'components', 'icons'), { recursive: true });

  const entries = [];
  for (const { name, fill } of ICONS) {
    const outline = await extractBody(`${name}.svg`);
    const filled = fill ? await extractBody(`${name}-fill.svg`) : null;
    entries.push({ name, outline, filled });
  }

  const lines = [
    '// Bu dosya otomatik üretildi — elle düzenlemeyin.',
    '// Yeniden üretmek için: npm run generate:icons',
    '//',
    '// Kaynak: @material-symbols/svg-400 (Apache-2.0)',
    '// Tüm ikonlar 0 -960 960 960 viewBox sistemini kullanır.',
    '',
    'export type IconName =',
    ...entries.map((e, i) => `  | '${e.name}'${i === entries.length - 1 ? ';' : ''}`),
    '',
    'type IconPaths = { outline: string; filled: string | null };',
    '',
    'export const ICON_PATHS: Record<IconName, IconPaths> = {',
    ...entries.map(
      (e) =>
        `  ${e.name}: {\n` +
        `    outline: ${JSON.stringify(e.outline)},\n` +
        `    filled: ${e.filled ? JSON.stringify(e.filled) : 'null'},\n` +
        `  },`
    ),
    '};',
    '',
  ];

  await writeFile(OUT_FILE, lines.join('\n'));

  const withFill = entries.filter((e) => e.filled).length;
  console.log(`${entries.length} ikon üretildi (${withFill} tanesi dolu varyantıyla)`);
  console.log(`-> ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
