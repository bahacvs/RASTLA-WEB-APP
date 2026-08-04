/**
 * RASTLA service worker.
 *
 * İki amacı var:
 *   1. Uygulamayı kurulabilir kılmak (mağazasız "ana ekrana ekle").
 *   2. **Görüntülenmiş bir bileti sinyalsizken de açabilmek.** Asıl mesele bu:
 *      müşteri sahilde, kapsama alanı zayıfken QR'ını göstermek zorunda.
 *
 * Tasarım kararları:
 * - Sayfalar için "önce ağ, olmazsa önbellek". Doluluk ve slot bilgisi
 *   sürekli değiştiği için bayat sayfa göstermek yanlış olur; ağ varken hep
 *   taze içerik gelir, yoksa son görülen hâl gösterilir.
 * - Yalnızca GET önbelleklenir. Rezervasyon ve onay istekleri (server action,
 *   POST) asla önbelleğe girmez — yoksa iptal edilmiş bir işlem tekrar
 *   oynatılabilirdi.
 * - İşletme ekranları bilinçli olarak önbelleklenmez: bilet onayı çevrimdışı
 *   yapılamaz, çünkü "bir kez kullanım" güvencesi sunucudaki koşullu
 *   güncellemeye dayanır. Çevrimdışı onay, aynı biletin iki kez geçmesi
 *   demek olurdu.
 */

const VERSION = 'rastla-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const PAGE_CACHE = `${VERSION}-pages`;

const SHELL = ['/', '/ara', '/rezervasyonlarim'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Tek bir adresin başarısız olması kurulumu düşürmesin.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/** Çevrimdışı açılabilmesi anlamlı olan sayfalar. */
function isCacheablePage(url) {
  if (url.pathname.startsWith('/isletme')) return false;
  return (
    url.pathname === '/' ||
    url.pathname.startsWith('/ara') ||
    url.pathname.startsWith('/aktivite/') ||
    url.pathname.startsWith('/bilet/') ||
    url.pathname === '/rezervasyonlarim'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Sadece kendi kaynağımızdan gelen GET istekleri. Harita karoları ve
  // sunucu aksiyonları dokunulmadan geçer.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Next'in RSC yükleri önbelleklenmez; bayat veri karışıklık yaratır.
  if (url.searchParams.has('_rsc')) return;

  // Statik varlıklar: önce önbellek (içerik adresli oldukları için bayatlamaz).
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/images/') ||
      url.pathname.startsWith('/brand/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  if (request.mode !== 'navigate' || !isCacheablePage(url)) return;

  // Sayfalar: önce ağ, başarısızsa son görülen hâl.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        const shell = await caches.match('/');
        if (shell) return shell;

        return new Response(
          '<!doctype html><meta charset="utf-8"><title>Çevrimdışı</title>' +
            '<body style="font-family:system-ui;padding:2rem;text-align:center">' +
            '<h1>Bağlantı yok</h1><p>Daha önce açtığınız biletler çevrimdışı görüntülenebilir.</p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
        );
      })
  );
});
