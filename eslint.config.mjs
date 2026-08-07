import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    // public/maplibre: derleme öncesinde node_modules'ten kopyalanan MapLibre
    // worker dosyaları. Bizim kodumuz değil ve depoya da girmiyor.
    ignores: ['.next/**', 'node_modules/**', 'reference/**', 'public/maplibre/**'],
  },
];

export default eslintConfig;
