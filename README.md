# RASTLA Web App

RASTLA, Türkiye'deki su sporları ve yerel turistik aktiviteleri tek platformda keşfetme, karşılaştırma ve rezervasyon yapma vizyonuyla geliştirilen bir deneyim pazaryeridir.

## Pilot kapsam

- Bölge: İstanbul, Büyükçekmece Sahili
- İlk kategoriler: elektrikli SUP, SUPMARAN, jet ski ve kano
- Hedef kullanıcı: yerli ve yabancı turist
- Temel değer: açık fiyat, doğrulanmış işletme ve kolay rezervasyon

## Teknoloji

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** — tasarım tokenları `app/globals.css` içindeki `@theme` bloğunda
- Yerel **Inter** fontu (`@fontsource/inter`) ve yerel SVG ikonlar
- Dış çalışma zamanı bağımlılığı yok

## Ekranlar

| Rota | Ekran |
| --- | --- |
| `/` | Ana sayfa — arama formu, kategoriler, popüler ve bugün müsait deneyimler |
| `/ara` | Arama — metin ve kategori filtresi, liste/harita geçişi, filtre paneli |
| `/aktivite/[slug]` | Aktivite detayı — galeri, bilgiler, harita, değerlendirmeler |
| `/rezervasyon/[slug]` | Rezervasyon — tarih, saat, katılımcı seçimi ve tutar hesabı |

Arama `?q=` ve `?kategori=` parametrelerini kabul eder; ana sayfadaki form ve kategori çipleri buraya bağlanır. Arama Türkçe'ye duyarlıdır: aksan ve büyük/küçük harf farkı yok sayılır (`buyukcekmece` → `Büyükçekmece`).

Ayrıca `/sitemap.xml`, `/robots.txt` ve `/manifest.webmanifest` üretilir; aktivite sayfaları schema.org `Product` yapılandırılmış verisi taşır.

## Yerelde çalıştırma

```bash
npm install
npm run dev
```

Ardından `http://localhost:3000` adresini açın.

Diğer komutlar:

```bash
npm run build            # üretim derlemesi
npm start                # derlenmiş uygulamayı servis eder
npm run lint             # ESLint
npm run generate:icons   # ikon SVG'lerini yeniden üretir
npm run fetch:images     # prototip görsellerini yeniden indirir (kaynak kaydı)
```

## Pilot rezervasyon kanalı

Ödeme altyapısı ve rezervasyon veritabanı devreye girene kadar rezervasyon talepleri **WhatsApp üzerinden, elle** karşılanır. Kullanıcının seçtiği tarih, saat, katılımcı sayısı ve tutar hazır bir mesaja dönüşür.

`.env.example` dosyasını `.env.local` olarak kopyalayıp doldurun:

| Değişken | Etkisi |
| --- | --- |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Operasyonun numarası (uluslararası biçim, yalnızca rakam: `905321234567`). **Tanımlı değilse** rezervasyon butonu "Yakında" olarak devre dışı kalır — bozuk bağlantı üretilmez. |
| `NEXT_PUBLIC_SITE_URL` | Sitenin genel adresi. Sitemap, robots, canonical ve Open Graph etiketleri ile WhatsApp mesajındaki bağlantı bunu kullanır. Vercel'de tanımsızsa dağıtımın kendi adresine düşer. |

Bunlar `NEXT_PUBLIC_*` oldukları için **derleme anında** gömülür; değiştirdikten sonra yeniden derleyin.

Bu kanal geçicidir: gerçek rezervasyon kaydı, ödeme ve müsaitlik yönetimi devreye girdiğinde `lib/whatsapp.ts` ve `BookingAction` bileşeni kaldırılacaktır.

## Doğrulama betikleri

Sunucu ayaktayken (`npm start`) çalıştırılır:

```bash
node scripts/verify-offline.mjs       # hiçbir dış host'a istek atılmadığını doğrular
node scripts/verify-interactions.mjs  # görünüm geçişi, filtre paneli, tutar hesabı
node scripts/screenshots.mjs [dizin]  # her rotanın mobil + masaüstü görüntüsü
```

## Tasarım sistemi

`DESIGN.md` renk, tipografi, boşluk ve bileşen kurallarının kaynağıdır. Frontmatter'daki tokenlar `app/globals.css` içindeki `@theme` bloğuna birebir taşınmıştır; tasarım değiştiğinde iki dosya birlikte güncellenmelidir.

Bilinen bir tuzak: `--spacing-md` gibi adlandırılmış boşluk tokenları Tailwind'in `--container-*` ölçeğini gölgeler, bu yüzden `max-w-md` 28rem yerine 16px'e çözülür. Sabit genişlik gerektiğinde `max-w-[28rem]` gibi açık değer kullanın.

## Gerçekçi teknik durum

Bu çalışma tam bir üretim uygulaması değildir; veri katmanı henüz sahtedir.

1. ~~Tasarım React/Next.js bileşenlerine ayrılmalı.~~ **Tamamlandı.**
2. ~~Görseller kalıcı dosyalarla değiştirilmeli.~~ **Kısmen tamamlandı** — görseller repoya alındı, ancak lisans durumu hâlâ açık (aşağıya bakın).
3. Kimlik doğrulama, ödeme, rezervasyon ve işletme yönetimi geliştirilmelidir.
4. Harita sağlayıcısı ve konum altyapısı seçilmelidir — şu an harita statik bir görseldir.
5. KVKK, mesafeli satış, iptal/iade ve işletme sözleşmeleri hazırlanmalıdır.

Rezervasyon akışı arayüz seviyesinde çalışır (tarih, saat, katılımcı ve tutar hesabı gerçek state'e bağlıdır) ancak veritabanına hiçbir kayıt yazmaz — talepler yukarıdaki pilot kanaldan elle karşılanır.

### Görsel lisansı — açık madde

`public/images/` altındaki aktivite görselleri Google Stitch tarafından üretilmiş geçici varlıklardır. Kaynak URL'leri süresiz olmadığı için repoya indirildiler; bu, prototipin bozulmasını önler ama **kullanım hakkını doğrulamaz.** Üretime çıkmadan önce lisanslı stok görseller veya kendi çekimlerinizle değiştirilmelidirler.

Marka varlıkları (`public/brand/`) ve ikonlar bu kapsamda değildir — ikonlar Material Symbols'tan (Apache-2.0) üretilmiştir.

## Marka renkleri

| Rol | Renk |
| --- | --- |
| Ana mavi | `#0754B8` |
| Koyu lacivert | `#102334` |
| Mercan vurgu | `#FF5A4F` |
| Kırık beyaz | `#FAF8F5` |
| Metin gri | `#667085` |

## Proje yapısı

```
app/                  rotalar ve global stiller
components/           paylaşılan bileşenler (Icon, kartlar, navigasyon)
components/icons/     üretilmiş SVG ikon verisi — elle düzenlenmez
lib/                  veri modeli ve biçimlendirme yardımcıları
public/               görseller ve marka varlıkları
scripts/              varlık üretimi ve doğrulama betikleri
reference/prototypes/ özgün statik Stitch ekranları (build'e dahil değil)
```

## Sonraki geliştirme hedefi

`lib/data.ts` içindeki sahte veriyi gerçek bir kaynağa (API/veritabanı) bağlamak, ardından işletme tarafında müsaitlik yönetimini eklemek. Online ödeme kontrollü bir sonraki fazda devreye alınmalıdır.
