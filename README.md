# RASTLA Web App

RASTLA, Türkiye'deki su sporları ve yerel turistik aktiviteleri tek platformda keşfetme, karşılaştırma ve rezervasyon yapma vizyonuyla geliştirilen bir deneyim pazaryeridir.

> **Yayına almak için:** [KURULUM.md](KURULUM.md) — kod tarafı hazır; o belge yalnızca sizden gelmesi gereken şeyleri (şirket bilgileri, veritabanı, anahtarlar, hukukçu onayı) sırayla listeler.

## Pilot kapsam

- Bölge: İstanbul, Büyükçekmece Sahili
- İlk kategoriler: elektrikli SUP, SUPMARAN, jet ski ve kano
- Hedef kullanıcı: yerli ve yabancı turist
- Temel değer: açık fiyat, doğrulanmış işletme ve kolay rezervasyon

## Teknoloji

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** — tasarım tokenları `app/globals.css` içindeki `@theme` bloğunda
- **Postgres** (üretim) / **SQLite** (geliştirme) — tek bir `DATABASE_URL` ile seçilir
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
| `/hesabim` | Verilerini indirme ve hesap silme (KVKK md. 11) |
| `/isletme` | İşletme girişi |
| `/isletme/tara` | Bilet okutma ve onaylama |
| `/isletme/aktiviteler` | Aktivite ekleme, düzenleme, yayına alma |
| `/isletme/aktiviteler/[id]/takvim` | Takvim kuralı ve slot yönetimi |
| `/isletme/rezervasyonlar` | Güne göre rezervasyonlar ve doluluk |
| `/isletme/ekip` | Ekip yönetimi — hesap ekleme, parola sıfırlama, askıya alma (sahip) |
| `/isletme/gunluk` | İşlem günlüğü — kim, ne zaman, ne yaptı (sahip) |

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
| `NEXT_PUBLIC_SITE_URL` | Sitenin genel adresi. Sitemap, robots, canonical, Open Graph ve bilet QR'ının işaret ettiği adres. |
| `DATABASE_PATH` | SQLite dosyası (varsayılan `data/rastla.db`). |
| `NEXT_PUBLIC_MAPTILER_KEY` | Harita karo sağlayıcısı anahtarı. Tanımsızsa harita yerine yapılandırma uyarısı gösterilir. |

### İşlem günlüğü

Bilet onayı, iptal ve fiyat değişikliği geri alınamaz işlemlerdir. `audit_log` tablosu bunları kim yaptı, ne zaman, hangi IP'den sorularını cevaplar; sahip `/isletme/gunluk` üzerinden okur.

İki kural koda gömülü:

- **Günlük yazımı asıl işlemi engellemez.** Günlük yazılamazsa rezervasyon geri alınmaz; hata konsola düşer.
- **Kişisel veri günlüğe kopyalanmaz.** Misafirin adı, telefonu ve bilet kodu `meta` alanına yazılmaz — kayıt zaten hangi rezervasyonu işaret ettiğini biliyor. Kopyalamak aynı veriyi ikinci bir yerde çoğaltmak, yani bir ihlalde kapsamı büyütmek olurdu. `verify-audit.mjs` bunu her koşumda tüm tabloyu tarayarak doğrular.

IP ve tarayıcı bilgisi kişisel veridir; 12 ay sonunda silinir:

```bash
npm run gorev                        # işleri listeler
npm run gorev -- saklama             # ne silineceğini gösterir, SİLMEZ
npm run gorev -- saklama --uygula    # gerçekten siler
```

Aynı işler `/api/gorevler/<ad>` üzerinden de çalışır (Vercel Cron buraya çağrı
yapar) ve **tam olarak aynı kodu** çağırır. Uç `CRON_SECRET` ile korunur;
**sır tanımlı değilse uç tamamen kapalıdır** — yapılandırmayı unutmak sessiz
bir güvenlik açığına dönüşmesin diye.

### Kişisel veri hakları (KVKK md. 11)

`/hesabim` üzerinden misafir kendi verisini indirebilir ve hesabını silebilir. İkisi de elle karşılanan talep olmaktan çıktı.

**Silme, satırı silmez — anonimleştirir.** Rezervasyon ve bilet kayıtları 10 yıllık zamanaşımı boyunca saklanmak zorunda ve `bookings.user_id` kullanıcı satırına bağlı; satırı silmek ya geçmişi de silerdi ya da yetim kayıt bırakırdı. Bunun yerine ad ve telefon **geri döndürülemez** biçimde değiştirilir. Telefon yerine rastgele bir yer tutucu yazılır: numaranın özeti yazılsaydı, elinde numara olan biri kaydı yeniden eşleştirebilirdi — bu anonimleştirme değil, takma adlandırma olurdu.

İki ayrıntı önemliydi:

- **Aktif rezervasyon varken silme reddedilir.** İşletmenin misafiri karşılayabilmesi için adına ihtiyacı var. Kullanıcı isterse tek kutuyla "bunları da iptal et" der; sessizce iptal etmek, işletmenin beklediği bir misafiri ortadan kaldırmak olurdu.
- **Silinen hesabın çerezi anında geçersizleşir.** Çerez 90 gün geçerli ve imzası silmeyle bozulmaz; yalnızca çereze bakılsaydı başka bir cihazda kalmış oturum geçmişi açmaya devam ederdi.

`verify-account-rights.mjs` (33 kontrol) bunların hepsini gerçek tarayıcıyla ve veritabanını doğrudan okuyarak doğrular.

### Hız sınırı

Üç yer korunuyor, üçünün gerekçesi farklı:

| Nerede | Sınır | Neden |
| --- | --- | --- |
| İşletme girişi (e-posta başına) | 15 dakikada **5 başarısız** | Kaba kuvvet |
| İşletme girişi (IP başına) | 15 dakikada **20 başarısız** | E-posta gezen saldırgan |
| Bilet onayı (personel başına) | 5 dakikada **20 başarısız** | Kod sondajı |
| Rezervasyon (telefon başına) | Saatte **8** | Kötüye kullanım |
| Rezervasyon (IP başına) | Saatte **40** | Betikle kötüye kullanım |

İki tasarım kararı:

- **Sayılan şey başarısızlıktır, deneme değil.** Günde yirmi kez giren personel saldırgan değildir; onu engellemek yalnızca işini durdururdu. Kaba kuvvetin tanımı arka arkaya başarısızlıktır ve ondan kaçış yoktur. Doğru parola girildiğinde o e-postanın sayacı sıfırlanır.
- **IP sınırları bilinçli olarak gevşek.** Türkiye'de mobil operatörler CGNAT kullanır: yüzlerce kullanıcı tek bir genel IP'nin arkasından çıkar. Sıkı bir IP sınırı, aynı sahildeki müşterilerin birbirini engellemesi demek olurdu. Gerçek sınır telefon numarası ve e-posta bazında; IP yalnızca emniyet ağı.

Karar, projenin geri kalanındaki desenle aynı biçimde **tek bir koşullu SQL ifadesinde** verilir. `verify-rate-limit.mjs` bunu 30 eşzamanlı süreçle sınar: 10'luk kotayı tam olarak 10 istek geçer.

### Veritabanı: SQLite ve Postgres

Hangisinin kullanılacağını tek bir değişken belirler:

| `DATABASE_URL` | Sonuç |
| --- | --- |
| tanımsız | Yerel SQLite dosyası (`data/rastla.db`) — geliştirme ve doğrulama betikleri |
| tanımlı | Postgres — üretim |

**Üretim için gereken tek şey bir bağlantı dizesidir.** Şema, ilk bağlantıda kendiliğinden kurulur; ayrı bir göç adımı yoktur.

Erişim katmanı (`lib/db/index.mjs`) iki ağız farkını kapatır: yer tutucular (`?` ve `@ad` → `$1`) ve `PRAGMA`/`REAL` gibi SQLite'a özgü ifadeler. Sorguların geri kalanı — koşullu `UPDATE`, `CHECK`, `ON CONFLICT`, `RETURNING` — iki motorda da aynı yazılır.

Üç ayrıntı bilerek çözüldü:

- **Arayüz eşzamansız.** Postgres sürücüleri eşzamanlı çalışamaz; eşzamanlı bir arayüz seçilseydi Postgres'e geçiş hiç mümkün olmazdı. SQLite sürücüsü de aynı sözü verir, böylece çağıran taraf motoru bilmek zorunda kalmaz.
- **`COUNT()` ve `SUM()` Postgres'te `bigint` döner** ve sürücü bunu **dizgi** olarak verir. `row.n === 0` karşılaştırması sessizce hep yanlış çıkardı; sayımlar `toCount()` ile çevrilir.
- **Benzersizlik ihlali iki motorda farklı görünür** (`UNIQUE constraint failed` / SQLSTATE 23505); ikisi de tanınır.

`lib/db/index.mjs` bilinçli olarak TypeScript değil düz ESM: `npm run seed`, `npm run retention` ve `operator-account` betikleri de aynı bağlantıyı kullanmak zorunda ve düğüm betikleri TypeScript modülünü doğrudan çalıştıramaz. Türler JSDoc ile verildi; uygulama tarafı yine tam tip denetimi görür.

`verify-postgres.mjs`, tek kullanım güvencesini ve kapasite sınırını **gerçek Postgres'te ve ayrı işletim sistemi süreçleriyle** yeniden kanıtlar: 12 süreç aynı bileti onaylamayı dener, tam olarak biri geçer; 5 kişilik slota 20 süreç girer, tam olarak 5'i geçer.

### Bu fazın bilinen sınırları

Aşağıdakiler **pilot seviyesindedir** ve üretime çıkmadan önce değişmelidir:

1. **Misafir kimliği doğrulanmıyor.** Kullanıcı adını ve telefonunu beyan eder, doğrulanmaz; oturum imzalı çerezle aynı cihaza bağlıdır. SMS OTP gerekir.
2. **İşletme girişi tek katmanlı.** Hesaplar kişiye özel (e-posta + parola, scrypt özeti) ama ikinci faktör (SMS/TOTP) yok.
3. **İhlal uyarısı otomatik değil.** İşlem günlüğü ve hız sınırı var; şüpheli bir örüntüde kimseye bildirim gitmiyor, günlük elle inceleniyor.
4. **Ödeme yoktur.** Tutar hesaplanır ama tahsil edilmez; ödeme deneyim yerinde alınır.
5. **Fotoğraf yükleme yoktur.** İşletme metin alanlarını ve takvimi yönetir; görselleri RASTLA ekler.
6. **Harita karoları dış bağımlılıktır.** Uygulamanın tek dış isteği budur ve kaçışı yoktur. Sağlayıcı kullanıcı IP'lerini görür — KVKK aydınlatma metninde yer almalı.

## Doğrulama betikleri

Sunucu ayaktayken (`npm start`) çalıştırılır:

```bash
node scripts/verify-redemption.mjs    # tek kullanım güvencesi (eşzamanlılık dahil) — sunucu gerekmez
node scripts/verify-capacity.mjs      # slot üretimi ve kapasite yarışı — sunucu gerekmez
node scripts/verify-accounts.mjs      # parola özeti, rol ve son-sahip koruması — sunucu gerekmez
node scripts/verify-operator-flow.mjs # aktivite -> takvim -> yayın -> rezervasyon -> bilet
node scripts/verify-ticket-flow.mjs   # rezervasyon -> bilet -> onay -> ikinci onay reddi
node scripts/verify-offline-ticket.mjs # bağlantı kesikken bilet ve QR açılıyor mu
node scripts/verify-offline.mjs       # harita karoları dışında dış istek var mı
node scripts/verify-audit.mjs         # işlem günlüğü: ne kaydediliyor, ne KAYDEDİLMİYOR
node scripts/verify-rate-limit.mjs    # hız sınırı ve 30 süreçli eşzamanlılık
node scripts/verify-jobs.mjs          # zamanlayıcı ucunun yetkilendirmesi
node scripts/verify-account-rights.mjs # veri indirme ve hesap silme (KVKK md. 11)

# Postgres'e karşı (DATABASE_URL tanımlıyken):
DATABASE_URL=… node scripts/verify-postgres.mjs   # eşzamanlılık ve ağız farkları
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
