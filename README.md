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
- **SQLite** (pilot) — aktiviteler, takvim, slotlar, rezervasyon ve biletler
- **MapLibre GL** + karo sağlayıcısı — gerçek harita
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
| `/isletme/aktiviteler` | Aktivite ekleme, düzenleme, yayına alma |
| `/isletme/aktiviteler/[id]/takvim` | Takvim kuralı ve slot yönetimi |
| `/isletme/rezervasyonlar` | Güne göre rezervasyonlar ve doluluk |

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
npm run seed             # başlangıç aktivitelerini ve takvimlerini yazar
npm run generate:icons   # ikon SVG'lerini yeniden üretir
npm run fetch:images     # prototip görsellerini yeniden indirir (kaynak kaydı)
```

## Müsaitlik ve kapasite

İşletme her aktivite için tekrarlayan bir takvim kuralı tanımlar — örneğin **08:00'dan 18:00'e, 15 dakikada bir, her slotta 4 kişi**. Kuraldan günde 40 slot üretilir (08:00 … 17:45).

Kurallar tek gerçek kaynaktır; slotlar onlardan maddeleştirilir. Üretim idempotenttir, tekrar çalıştırmak kopya oluşturmaz. Kapasite slota üretim anında **kopyalanır**: kural sonradan değişse de mevcut rezervasyonların dayandığı kapasite geriye dönük bozulmaz. Kural değiştiğinde rezervasyonu olan slotlar korunur, yalnızca boş ve kuralsız kalanlar kapatılır.

### Kapasite neyi sayar?

Aktivite bazında işletme seçer — hangi araca kaç kişi güvenli sığar, bunu işletme bilir:

| Mod | Davranış | Uygun olduğu yer |
| --- | --- | --- |
| `per_person` | 4 kapasiteli slot 4 **kişi** alır; 2 kişilik rezervasyon 2 yer düşürür | Grup turu, SUP |
| `per_booking` | 4 kapasiteli slot 4 **rezervasyon** alır; 2 kişilik rezervasyon 1 yer düşürür | Her müşteriye bir araç düşen jet ski |

### Aşırı rezervasyon güvencesi

Bilet onayındaki desenin aynısı:

```sql
UPDATE slots SET booked = booked + :units
 WHERE id = :id AND status = 'open' AND booked + :units <= capacity
```

Atomiktir; son yeri iki kişi aynı anda almaya çalıştığında yalnızca biri geçer. `scripts/verify-capacity.mjs` bunu 12 eşzamanlı süreçle sınar. Şemadaki `CHECK (booked <= capacity)` son savunma hattıdır.

## İptal ve kapasite iadesi

Rezervasyon hem müşteri hem işletme tarafından iptal edilebilir; iptal edilen yerin kapasitesi slota **tam olarak bir kez** geri verilir. Çift tıklama ya da tekrar gönderim kapasiteyi şişirmez — güvence yine koşullu güncellemede:

```sql
UPDATE bookings SET status='cancelled', ... WHERE code=? AND status='confirmed'
```

Etkilenen satır 1 değilse iade yapılmaz. Kullanılmış (`redeemed`) bir bilet iptal edilemez: hizmet zaten verilmiştir.

**Hava koşulu ayrı tutulur.** Su sporlarında en sık iptal sebebi budur ve müşteri kusurlu değildir, bu yüzden `cancel_reason = 'weather'` olarak kaydedilir — iade politikası farklı işleyecektir. İşletme, tek tek uğraşmadan bir günün tüm rezervasyonlarını tek düğmeyle iptal edebilir.

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

### QR okuma her cihazda çalışır

`BarcodeDetector` yalnızca Chromium tabanlı tarayıcılarda var; Safari'de yok. İşletme sahiplerinin bir kısmı iPhone kullanacağı için tek başına yeterli değildi — o cihazlarda 20 karakterlik kodu elle yazmak gerekiyordu.

`lib/qr-scanner.ts` cihazda ne varsa onu seçer: yerleşik çözücü varsa o, yoksa **jsQR** ile yazılımsal çözme. jsQR bağımlılığı olmayan yerel bir paket, dışarı istek atmaz. `verify-ticket-flow.mjs` ürettiğimiz QR'ı jsQR ile gerçekten çözerek bu yolu doğrular.

### Yapılandırma

`.env.example` dosyasını `.env.local` olarak kopyalayıp doldurun:

| Değişken | Etkisi |
| --- | --- |
| `SESSION_SECRET` | Oturum çerezlerini imzalar. Üretimde rastgele ve gizli olmalı (`openssl rand -base64 32`). |
| `OPERATOR_ACCESS_CODES` | `isletme:kod` çiftleri, virgülle ayrılır. Tanımsızsa işletme girişi kapalıdır. |
| `NEXT_PUBLIC_SITE_URL` | Sitenin genel adresi. Sitemap, robots, canonical, Open Graph ve bilet QR'ının işaret ettiği adres. |
| `DATABASE_PATH` | SQLite dosyası (varsayılan `data/rastla.db`). |
| `NEXT_PUBLIC_MAPTILER_KEY` | Harita karo sağlayıcısı anahtarı. Tanımsızsa harita yerine yapılandırma uyarısı gösterilir. |

### Bu fazın bilinen sınırları

Aşağıdakiler **pilot seviyesindedir** ve üretime çıkmadan önce değişmelidir:

1. **SQLite kalıcı değildir.** Vercel'in sunucusuz ortamında dosya sistemi geçicidir; üretimde Postgres'e geçilmelidir. Etkilenen tek yer `lib/db/`.
2. **Kimlik doğrulanmıyor.** Kullanıcı adını ve telefonunu beyan eder, doğrulanmaz; oturum imzalı çerezle aynı cihaza bağlıdır. SMS OTP gerekir.
3. **İşletme girişi paylaşılan koddur.** Kişi bazında hesap ve rol yönetimi yoktur.
4. **Ödeme yoktur.** Tutar hesaplanır ama tahsil edilmez; ödeme deneyim yerinde alınır.
5. **Fotoğraf yükleme yoktur.** İşletme metin alanlarını ve takvimi yönetir; görselleri RASTLA ekler.
6. **Harita karoları dış bağımlılıktır.** Uygulamanın tek dış isteği budur ve kaçışı yoktur. Sağlayıcı kullanıcı IP'lerini görür — KVKK aydınlatma metninde yer almalı.

## Doğrulama betikleri

Sunucu ayaktayken (`npm start`) çalıştırılır:

```bash
node scripts/verify-redemption.mjs    # tek kullanım güvencesi (eşzamanlılık dahil) — sunucu gerekmez
node scripts/verify-capacity.mjs      # slot üretimi ve kapasite yarışı — sunucu gerekmez
node scripts/verify-operator-flow.mjs # aktivite -> takvim -> yayın -> rezervasyon -> bilet
node scripts/verify-ticket-flow.mjs   # rezervasyon -> bilet -> onay -> ikinci onay reddi
node scripts/verify-offline-ticket.mjs # bağlantı kesikken bilet ve QR açılıyor mu
node scripts/verify-offline.mjs       # harita karoları dışında dış istek var mı
node scripts/verify-interactions.mjs  # görünüm geçişi, filtre paneli, tutar hesabı
node scripts/screenshots.mjs [dizin]  # her rotanın mobil + masaüstü görüntüsü
```

## Çevrimdışı çalışma (PWA)

Uygulama service worker ile kurulabilir ("ana ekrana ekle") ve **daha önce açılmış bir bilet bağlantı kesikken de açılır.** Asıl mesele bu: müşteri sahilde, kapsama alanı zayıfken QR'ını göstermek zorunda.

Sayfalarda "önce ağ, olmazsa önbellek" yaklaşımı kullanılır — doluluk sürekli değiştiği için bayat sayfa göstermek yanlış olurdu.

**İşletme ekranları bilinçli olarak önbelleklenmez.** Bilet onayı çevrimdışı yapılamaz, çünkü tek kullanım güvencesi sunucudaki koşullu güncellemeye dayanır; çevrimdışı onay aynı biletin iki kez geçmesi demek olurdu. `verify-offline-ticket.mjs` hem biletin açıldığını hem de onay ekranının açılmadığını doğrular.

## Tasarım sistemi

`DESIGN.md` renk, tipografi, boşluk ve bileşen kurallarının kaynağıdır. Frontmatter'daki tokenlar `app/globals.css` içindeki `@theme` bloğuna birebir taşınmıştır; tasarım değiştiğinde iki dosya birlikte güncellenmelidir.

Bilinen bir tuzak: `--spacing-md` gibi adlandırılmış boşluk tokenları Tailwind'in `--container-*` ölçeğini gölgeler, bu yüzden `max-w-md` 28rem yerine 16px'e çözülür. Sabit genişlik gerektiğinde `max-w-[28rem]` gibi açık değer kullanın.

## Gerçekçi teknik durum

Bu çalışma tam bir üretim uygulaması değildir; veri katmanı henüz sahtedir.

1. ~~Tasarım React/Next.js bileşenlerine ayrılmalı.~~ **Tamamlandı.**
2. ~~Görseller kalıcı dosyalarla değiştirilmeli.~~ **Kısmen tamamlandı** — görseller repoya alındı, ancak lisans durumu hâlâ açık (aşağıya bakın).
3. Rezervasyon kaydı ve işletme onay akışı **çalışıyor**; kimlik doğrulama (SMS OTP), ödeme ve müsaitlik yönetimi eksik.
4. ~~Harita sağlayıcısı seçilmeli.~~ **Tamamlandı** — MapLibre + karo sağlayıcısı; işletme konumu koordinat olarak girer.
5. KVKK metinleri **taslak olarak hazırlandı** (`legal/`), hukukçu onayı bekliyor. Mesafeli satış sözleşmesi, ön bilgilendirme formu ve işletme sözleşmeleri henüz yok.

İşletme kendi aktivitelerini ekleyip takvimini tanımlayabilir; rezervasyon slot kapasitesinden düşer ve QR kodlu bilet üretir. Ödeme hâlâ yoktur.

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
lib/db/               şema; aktivite, slot, rezervasyon ve kullanıcı depoları
public/               görseller ve marka varlıkları
scripts/              varlık üretimi ve doğrulama betikleri
reference/prototypes/ özgün statik Stitch ekranları (build'e dahil değil)
legal/                KVKK metinleri — TASLAK, hukukçu onayı bekliyor
```

## Sonraki geliştirme hedefi

`lib/data.ts` içindeki sahte veriyi gerçek bir kaynağa (API/veritabanı) bağlamak, ardından işletme tarafında müsaitlik yönetimini eklemek. Online ödeme kontrollü bir sonraki fazda devreye alınmalıdır.
