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
- **SQLite** (pilot) — rezervasyon ve bilet kayıtları
- Yerel **Inter** fontu (`@fontsource/inter`) ve yerel SVG ikonlar
- Dış çalışma zamanı bağımlılığı yok

## Ekranlar

| Rota | Ekran |
| --- | --- |
| `/` | Ana sayfa — arama formu, kategoriler, popüler ve bugün müsait deneyimler |
| `/ara` | Arama — metin ve kategori filtresi, liste/harita geçişi, filtre paneli |
| `/aktivite/[slug]` | Aktivite detayı — galeri, bilgiler, harita, değerlendirmeler |
| `/rezervasyon/[slug]` | Rezervasyon — tarih, saat, katılımcı seçimi, iletişim ve tutar hesabı |
| `/bilet/[code]` | QR kodlu bilet |
| `/rezervasyonlarim` | Kullanıcının kendi rezervasyonları |
| `/isletme` | İşletme girişi |
| `/isletme/tara` | Bilet okutma ve onaylama |

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

## Rezervasyon ve bilet sistemi

Rezervasyon oluşturulduğunda kullanıcıya **QR kodlu, tek kullanımlık bir bilet** üretilir. İşletme bu kodu kendi ekranından okutup onaylar.

### Tek kullanım güvencesi

Ürünün en kritik kuralı: **bir bilet yalnızca bir kez onaylanabilir.** Garanti tek bir koşullu güncellemeye dayanır (`lib/db/bookings.ts`):

```sql
UPDATE bookings SET status='redeemed', redeemed_at=?, redeemed_by=?
 WHERE code=? AND status='confirmed'
```

Bu ifade atomiktir. İki kişi aynı bileti aynı anda okutsa bile güncellemeler sırayla işlenir; ilki satırı `redeemed` yapar, ikincisinin `WHERE` koşulu artık tutmaz ve **0 satır** etkiler. Bu yüzden hiçbir yerde "önce oku, sonra yaz" biçiminde — yarış durumuna açık — bir kontrol yapılmaz.

Destekleyen önlemler:

- **Bilet kodu tahmin edilemez.** 160 bit kriptografik rastgelelik, Crockford Base32 ile yazılır (`I/L/O/U` yok, elle girilirken karışmaz).
- **Şema kısıtı**, `redeemed` bir kaydın zaman damgasız olmasını engeller.
- **Yetkilendirme**, onaylamadan önce yapılır: bir işletme yalnızca kendi aktivitesinin biletini onaylayabilir.
- Bilet ve rezervasyon sayfaları `noindex`; kod taşıdıkları için arama motorlarına kapalıdır.

Kural `scripts/verify-redemption.mjs` ile sınanır — 12 ayrı süreç aynı anda aynı bileti onaylamayı dener, tam olarak biri geçer.

### Yapılandırma

`.env.example` dosyasını `.env.local` olarak kopyalayıp doldurun:

| Değişken | Etkisi |
| --- | --- |
| `SESSION_SECRET` | Oturum çerezlerini imzalar. Üretimde rastgele ve gizli olmalı (`openssl rand -base64 32`). |
| `OPERATOR_ACCESS_CODES` | `isletme:kod` çiftleri, virgülle ayrılır. Tanımsızsa işletme girişi kapalıdır. |
| `NEXT_PUBLIC_SITE_URL` | Sitenin genel adresi. Sitemap, robots, canonical, Open Graph ve bilet QR'ının işaret ettiği adres. |
| `DATABASE_PATH` | SQLite dosyası (varsayılan `data/rastla.db`). |

### Bu fazın bilinen sınırları

Aşağıdakiler **pilot seviyesindedir** ve üretime çıkmadan önce değişmelidir:

1. **SQLite kalıcı değildir.** Vercel'in sunucusuz ortamında dosya sistemi geçicidir; üretimde Postgres'e geçilmelidir. Etkilenen tek yer `lib/db/`.
2. **Kimlik doğrulanmıyor.** Kullanıcı adını ve telefonunu beyan eder, doğrulanmaz; oturum imzalı çerezle aynı cihaza bağlıdır. SMS OTP gerekir.
3. **İşletme girişi paylaşılan koddur.** Kişi bazında hesap ve rol yönetimi yoktur.
4. **Ödeme yoktur.** Tutar hesaplanır ama tahsil edilmez; ödeme deneyim yerinde alınır.
5. **Müsaitlik kontrolü yoktur.** Aynı slota sınırsız rezervasyon alınabilir — kapasite yönetimi bir sonraki fazın işi.

## Doğrulama betikleri

Sunucu ayaktayken (`npm start`) çalıştırılır:

```bash
node scripts/verify-redemption.mjs    # tek kullanım güvencesi (eşzamanlılık dahil) — sunucu gerekmez
node scripts/verify-ticket-flow.mjs   # rezervasyon -> bilet -> onay -> ikinci onay reddi
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
3. Rezervasyon kaydı ve işletme onay akışı **çalışıyor**; kimlik doğrulama (SMS OTP), ödeme ve müsaitlik yönetimi eksik.
4. Harita sağlayıcısı ve konum altyapısı seçilmelidir — şu an harita statik bir görseldir.
5. KVKK, mesafeli satış, iptal/iade ve işletme sözleşmeleri hazırlanmalıdır.

Rezervasyon artık veritabanına yazılır ve QR kodlu bilet üretir; işletme bileti okutup onaylayabilir. Ödeme ve müsaitlik kontrolü hâlâ yoktur.

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
lib/                  veri modeli, oturum ve biçimlendirme yardımcıları
lib/db/               veritabanı şeması ve rezervasyon/kullanıcı depoları
public/               görseller ve marka varlıkları
scripts/              varlık üretimi ve doğrulama betikleri
reference/prototypes/ özgün statik Stitch ekranları (build'e dahil değil)
```

## Sonraki geliştirme hedefi

`lib/data.ts` içindeki sahte veriyi gerçek bir kaynağa (API/veritabanı) bağlamak, ardından işletme tarafında müsaitlik yönetimini eklemek. Online ödeme kontrollü bir sonraki fazda devreye alınmalıdır.
