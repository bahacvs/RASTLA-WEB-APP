import { ICON_PATHS, type IconName } from './icons/paths';

export type { IconName };

type IconProps = {
  name: IconName;
  /** Dolu varyantı çizer. Prototipteki `font-variation-settings: 'FILL' 1` karşılığı. */
  filled?: boolean;
  /** Kenar uzunluğu (px). Material Symbols fontunun font-size davranışına denk gelir. */
  size?: number;
  className?: string;
};

/**
 * Material Symbols ikonlarını yerel SVG verisinden çizer.
 *
 * Renk `currentColor` üzerinden gelir, yani üst elemandaki `text-*` sınıfları
 * prototipteki gibi çalışmaya devam eder.
 */
export function Icon({ name, filled = false, size = 24, className }: IconProps) {
  const paths = ICON_PATHS[name];
  const body = filled && paths.filled ? paths.filled : paths.outline;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 -960 960 960"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
