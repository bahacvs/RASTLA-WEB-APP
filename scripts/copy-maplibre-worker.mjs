import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * MapLibre'ın worker dosyalarını `public/maplibre/` altına kopyalar.
 *
 * Neden gerekiyor: maplibre-gl v6 worker adresini `import.meta.url`'den
 * türetiyor ve şöyle bir koruması var:
 *
 *     let e = import.meta.url;
 *     if (!/^https?:/.test(e)) return ``;      // boş dize
 *
 * Turbopack paketledikten sonra `import.meta.url` artık dist dosyasının
 * http(s) adresi olmuyor, dolayısıyla fonksiyon boş dize dönüyor ve
 * `new Worker('')` sayfanın kendi adresine çözülüyor. Worker HTML'i JavaScript
 * diye çalıştırmaya çalışıp **sessizce ölüyor** — hata olayı bile üretmiyor.
 *
 * Görünen sonuç şuydu: stil ve kaynak tanımı iniyor, arka plan katmanı
 * boyanıyor, pinler yerine oturuyor, ama tek bir karo bile istenmiyor. Çünkü
 * karoları ana iş parçacığı değil worker ister.
 *
 * Çözüm, adresi `setWorkerUrl()` ile açıkça vermek. Dosyaların kendi alan
 * adımızdan sunulması ayrıca projenin "harita sağlayıcısı dışında dış istek
 * yok" güvencesini koruyor.
 *
 * Kopyalama derleme öncesinde yapılıyor, dosyalar depoya girmiyor: elle
 * kopyalanmış 470 KB'lık bir ikiz, `npm update` sonrası sessizce eskir ve
 * çalışma zamanında sürüm uyuşmazlığı üretirdi. Burada her derlemede kurulu
 * sürümün kendisi kopyalanıyor.
 */

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', 'node_modules', 'maplibre-gl', 'dist');
const to = join(here, '..', 'public', 'maplibre');

// Worker `./maplibre-gl-shared.mjs` dosyasını göreli olarak istiyor; ikisi
// aynı klasörde olmak zorunda.
const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

mkdirSync(to, { recursive: true });
for (const file of files) copyFileSync(join(from, file), join(to, file));

console.log(`maplibre worker kopyalandı -> public/maplibre/ (${files.join(', ')})`);
