# RASTLA Web App

RASTLA, Türkiye'deki su sporları ve yerel turistik aktiviteleri tek platformda keşfetme, karşılaştırma ve rezervasyon yapma vizyonuyla geliştirilen bir deneyim pazaryeridir.

Arama ve rezervasyondan SMS doğrulamasına, online ödemeden bilet okutmaya kadar akışın tamamı çalışır durumda.

> **Yayına almak için:** [KURULUM.md](KURULUM.md) — kod tarafında yapılacak bir şey yok; o belge yalnızca sizden gelmesi gereken şeyleri (şirket bilgileri, veritabanı, ödeme ve mesaj anahtarları, ETBİS kaydı, hukukçu onayı) sırayla listeler.

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
| `/rezervasyon/[slug]` | Rezervasyon — tarih, saat, katılımcı seçimi, numara doğrulama ve tutar hesabı |
| `/odeme/donus` | Ödeme sağlayıcısının dönüş ucu — sonuç sağlayıcıdan sorulur |
| `/odeme/sonuc` | Ödeme tamamlanamadığında gelinen sayfa |
| `/bilet/[code]` | QR kodlu bilet |
| `/gorsel/[id]` | Yüklenen aktivite görselleri — kendi alan adımızdan sunulur |
| `/rezervasyonlarim` | Kullanıcının kendi rezervasyonları |
| `/hesabim` | Verilerini indirme ve hesap silme (KVKK md. 11) |
| `/partner` | RASTLA Partner — işletme tarafının açılış sayfası |
| `/isletme` | İşletme girişi |
| `/isletme/bugun` | **Bugün** — günün akışı, hızlı işlemler, elle rezervasyon (giriş sonrası varsayılan) |
| `/isletme/tara` | Bilet okutma ve onaylama |
| `/isletme/aktiviteler` | Aktivite ekleme, düzenleme, görsel yükleme, yayına alma |
| `/isletme/odeme-ayarlari` | Alt üye işyeri başvurusu ve komisyon bilgisi (sahip) |
| `/isletme/aktiviteler/[id]/takvim` | Takvim kuralı ve slot yönetimi |
| `/isletme/aktiviteler/[id]/fiyat` | Sezon/gün/saat fiyat kuralları ve grup indirimi |
| `/isletme/rezervasyonlar` | Güne göre rezervasyonlar ve doluluk |
| `/isletme/ekip` | Ekip yönetimi — hesap ekleme, parola sıfırlama, askıya alma (sahip) |
| `/isletme/finans` | Hak ediş — bekleyen/hak edilen bakiye, CSV mutabakat raporu (sahip) |
| `/isletme/gunluk` | İşlem günlüğü — kim, ne zaman, ne yaptı (sahip) |
| `/yonetim` | RASTLA operasyon girişi — işletme panelinden AYRI oturum |
| `/yonetim/isletmeler` | İşletme doğrulama, komisyon oranı, hak ediş durdurma |
| `/yonetim/ilanlar` | Doğrulanmamış işletmelerin ilan inceleme kuyruğu |

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

## Fiyatlandırma

Tek bir liste fiyatı gerçek hayatta yetmiyor: temmuz cumartesi öğleden sonrası ile mayıs salı sabahı aynı fiyata satılmıyor. İşletme kural yazamayınca ya ortalama bir fiyat koyup yoğun saatte para bırakıyor ya da yüksek koyup boş saati boş bırakıyordu.

İki ayrı kavram var, iki ayrı tablo:

| Ne | Soru | Tablo |
| --- | --- | --- |
| Fiyat kuralı | **Ne zaman?** — sezon, haftanın günü, saat aralığı | `price_rules` |
| Grup indirimi | **Kaç kişi?** — eşiği geçen gruba yüzde | `group_discounts` |

Kurallar **öncelik sırasına** göre taranır ve **ilk eşleşen kazanır**; hiçbiri uymuyorsa `activities.price_try` geçerlidir. "En özgül kural kazansın" gibi örtük bir seçim daha akıllı görünürdü ama işletme hangi fiyatın neden çıktığını göremezdi — bu yüzden ekrandaki liste değerlendirme sırasının aynısıdır ve uygulanan kuralın adı müşteriye de gösterilir.

Grup indiriminde kişi sayısının **geçtiği en yüksek eşik** uygulanır, yalnızca biri: üst üste binen indirimler işletmenin kafadan hesaplayamayacağı bir toplam üretirdi. İndirim tutarı yukarı yuvarlanır — yuvarlama farkı müşterinin lehine kalsın.

### Hesap tek yerde

`lib/pricing.mjs` saftır: veritabanı yok, `process` yok, ağ yok. Rezervasyon ekranındaki istemci bileşeni de sunucu eylemleri de aynı `quote()` fonksiyonunu çağırır, dolayısıyla **ekranda yazan tutar ile tahsil edilen tutar aynı koddan gelir.** Bu dosya açılmadan önce hesap beş yerde kopyaydı (rezervasyon ekranı, müşteri rezervasyonu, manuel kayıt, acente rezervasyonu, tanıtım betiği) ve fiyat kuralları eklenirken beşini birden güncellemek gerekecekti; biri unutulsaydı gösterilen tutar ile alınan tutar ayrışırdı.

Buna rağmen **sunucu her zaman yeniden hesaplar.** İstemciden gelen tutara güvenilmez: form alanı olarak taşınsaydı onu değiştiren biri 2.400 TL'lik turu 1 TL'ye alırdı. `scripts/verify-pricing.mjs` bunu forma `total` alanı enjekte ederek sınar.

Para **tam sayı** tutulur (`price_try INTEGER`); kayan noktayla hesaplanan bir kuruş, mutabakatta açıklanamayan bir fark demektir.

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
| `IYZICO_API_KEY` / `IYZICO_SECRET_KEY` | Ödeme sağlayıcısı. **İkisi de tanımsızsa online ödeme kapalıdır** ve ücret eskisi gibi deneyim yerinde alınır. |
| `IYZICO_SANDBOX` | `0` verilirse üretim ucu kullanılır; varsayılan sandbox. |
| `PAYMENT_PROVIDER` | Yalnızca test için `fake`. **Üretimde asla verilmemeli** — ödeme almadan bilet üretmek demek olurdu. |
| `PAYMENT_TIMEOUT_MINUTES` | Ödemesi bekleyen rezervasyonun düşürüleceği süre (varsayılan 20). |
| `FREE_CANCELLATION_HOURS` | Müşteri iptalinde tam iade eşiği (varsayılan 24). Ön bilgilendirme formuyla aynı olmalı. |
| `CRON_SECRET` | Zamanlanmış iş uçlarını korur. **Tanımsızsa uçlar tamamen kapalıdır.** |
| `BLOB_READ_WRITE_TOKEN` | Yüklenen görsellerin deposu. Tanımsızsa dosya sistemi kullanılır — sunucusuz ortamda kalıcı değildir. |
| `STORAGE_PROVIDER` / `UPLOAD_PATH` | Depoyu `local`'a zorlar; yerel kök dizini belirler. |

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

### SMS doğrulama

İki yerde:

- **Müşteri** rezervasyondan önce numarasını doğrular. Doğrulama **kapasite tutulmadan önce** yapılır; sonra yapılsaydı doğrulamayan biri slotları tutup bırakmayarak işletmenin gününü doldurabilirdi. Oturum 90 gün yaşadığı için geri dönen müşteriden her rezervasyonda kod istenmez — yalnızca numara değiştiğinde.
- **İşletme personeli** parolaya ek olarak kod girer. Parola doğru olsa bile oturum açılmaz; yarım kalan giriş ayrı ve 5 dakikalık imzalı bir çerezde taşınır, asıl oturum çerezine yazılsaydı ikinci faktörü geçmemiş biri korunan sayfalara girebilirdi.

Üç karar:

- **Kod düz metin saklanmaz**, tuzlu SHA-256 özeti saklanır. Bir veritabanı sızıntısı yalnızca geçmişi değil, o an bekleyen doğrulamaları da ele verirdi. Parola özetindeki scrypt burada kullanılmadı: kod 6 haneli ve 5 dakika yaşıyor, çevrimdışı kırma penceresi yok; buna karşılık her denemede 100 ms scrypt çalıştırmak ekranı gözle görülür yavaşlatırdı.
- **Kod hiçbir koşulda tarayıcıya döndürülmez.** "Yalnızca geliştirmede" diye eklenmiş bir yol, yanlış yapılandırılmış bir üretim dağıtımında ikinci faktörü tamamen anlamsız kılardı. Sağlayıcı yokken kod sunucu günlüğüne düşer; doğrulama betikleri oradan okur.
- **OTP mesajına pazarlama içeriği eklenmez.** Tek cümle kampanya metni, mesajın tamamını 6563 sayılı Kanun anlamında ticari ileti hâline getirir ve İYS onayı gerektirir. Şablonlar `lib/sms/messages.ts` içinde toplandı ve kural orada yazılı.

`verify-otp.mjs` (25 kontrol) kodun veritabanında ve işlem günlüğünde geçmediğini tüm tabloyu tarayarak doğrular, 5 yanlış denemeden sonra kodun yandığını gösterir ve 10 ayrı süreçle aynı kodun yalnızca bir kez tüketilebildiğini kanıtlar.

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

### Ödeme

Pazaryeri modeli: RASTLA tutarın tamamını tahsil eder, komisyonunu keser, kalanı işletmeye aktarır. İşletmenin sağlayıcıda **alt üye işyeri** olarak tanımlı olması gerekir; anahtarı olmayan işletmenin aktivitesi online ödemeye açılmaz — para, aktarılamayacak bir yerde toplanmamalı.

**Kart verisi bu sunucuya hiç değmez.** iyzico'nun barındırdığı Checkout Form kullanılıyor; elimize yalnızca bir token ve sağlayıcının döndürdüğü maskeli son dört hane geçiyor.

Akışın dayandığı üç savunma:

1. **Sonuç geri çağrının gövdesinden okunmaz.** Token ile sağlayıcıya sorulur (`resolve`). Gövdeye güvenilseydi adresi bilen biri "ödendi" diyen bir istek yollayıp bedava bilet alabilirdi.
2. **Tutar, para birimi ve eşleştirme kimliği bizim kaydımızla karşılaştırılır.** Uyuşmazsa ödeme reddedilir ve günlüğe `payment.denied` düşer.
3. **Onay tek koşullu UPDATE'tir:**

```sql
UPDATE bookings SET status='confirmed', confirmed_at=?
 WHERE id=? AND status='pending_payment'
```

Rezervasyon ödeme boyunca `pending_payment` durumunda bekler ve kapasitesi tutulur. Tek kullanım güvencesi burada bedavaya geliyor: bilet onayı zaten `WHERE code=? AND status='confirmed'` koşuluna dayandığı için **ödemesi tamamlanmamış bir rezervasyon hiçbir ek kod yazılmadan okutulamaz.**

Ödeme süresi dolan kayıtları `odeme-suresi` işi düşürür ve kapasiteyi geri verir. **Bu işin sık çalışması gerekir** (önerilen: beş dakikada bir); `vercel.json` içindeki zamanlama Vercel'in Hobby planı günlükten sık cron'a izin vermediği için günlüğe ayarlı ve ödeme canlıya çıkarken Pro plana geçilip değiştirilmelidir (bkz. KURULUM.md). Kapasite iadesi, durum değişikliği gerçekten olduysa yapıldığı için iki süpürme aynı yeri iki kez serbest bırakamaz.

İptalde iade politikası: **hava ve işletme kaynaklı iptalde koşulsuz tam iade** (müşteri kusurlu değil), müşteri iptalinde aktiviteden `FREE_CANCELLATION_HOURS` saat öncesine kadar tam iade. Belirli tarihte yapılan eğlence ve dinlenme hizmetleri Mesafeli Sözleşmeler Yönetmeliği md. 15 uyarınca cayma hakkı istisnasındadır; bu eşiğin ön bilgilendirme formunda açıkça yazılması gerekir. Aynı ödeme aynı sebeple iki kez iade edilemez — güvence kodda değil, `refunds` tablosundaki `UNIQUE (payment_id, reason)` kısıtındadır.

`verify-payment.mjs` (22 kontrol) bunların hepsini sınar: 12 ayrı süreç aynı geri çağrıyı işlediğinde rezervasyonun tam olarak bir kez onaylandığını, kurcalanmış tutarın reddedilip günlüğe `denied` düştüğünü, süre aşımının kapasiteyi tam olarak bir kez iade ettiğini ve ödemesi bekleyen biletin okutulamadığını gösterir.

### Görsel yükleme

İşletme aktivite başına en fazla 8 görsel yükleyebilir, her biri en fazla 6 MB. Yüklenen dosya **olduğu gibi saklanmaz**; sunucuda yeniden kodlanır. Dört gerçek riskin dördü de burada kapanıyor:

1. **Sahte içerik türü.** Karar, tarayıcının bildirdiği MIME'a ya da uzantıya değil, dosyanın **gerçek sihirli baytlarına** dayanır. `.jpg` uzantılı bir betik reddedilir.
2. **Sıkıştırma bombası.** Piksel sınırı (40 MP) görüntü belleğe açılmadan uygulanır; birkaç yüz kilobaytlık bir dosyanın yüzlerce megabayt istemesi engellenir.
3. **EXIF'te konum.** İşletmenin telefonuyla çektiği fotoğraf çekim koordinatını ve çoğu zaman cihaz seri numarasını taşır. Yeniden kodlama bunların **hepsini** düşürür. Bu bir mahremiyet meselesi: işletme fotoğraf koyduğunda kendi adresini yayımlamış olmamalı.
4. **Boyut ve adet.** Uzun kenar 1600 piksele indirilir, çıktı WebP olur.

**Görseller kendi alan adımızdan sunulur** (`/gorsel/[id]`). Doğrudan blob adresi verilseydi tarayıcı yeni bir dış host'a istek atardı; bu hem `verify-offline.mjs`'in koruduğu "harita dışında dış istek yok" güvencesini bozar hem de üçüncü bir tarafa her ziyaretçinin IP adresini gösterirdi. Bedeli fazladan bant genişliği, karşılığı mevcut mahremiyet iddiasının korunması.

`verify-uploads.mjs` (29 kontrol) bunu iddia etmekle kalmıyor: **GPS ve cihaz bilgisi taşıyan gerçek bir JPEG üretip yüklüyor, sonra sunucudan indirilen baytlarda EXIF'in kalmadığını gösteriyor** — hem sunulan kopyada hem depodaki dosyada. Ayrıca sahte dosyanın, bombanın ve adet sınırının reddedildiğini, sınırın arayüz engelleri DOM üzerinden kaldırıldığında bile **sunucuda** tutulduğunu doğruluyor.

### Otomatik ihlal uyarısı

İşlem günlüğü tutmak tek başına yetmiyordu: kimse bakmazsa bir saldırı orada sessizce durur. `uyarilar` işi on beş dakikada bir tespit kurallarını çalıştırıyor.

**Kurallar kod, veri değil** (`lib/alerts/rules.mjs`). Veritabanında yapılandırılabilir olsalardı kimsenin gözden geçirmediği eşiklere dönüşürlerdi; kodda oldukları için her değişiklik incelemeden geçiyor ve gerekçesi yanında yazıyor.

| Kural | Eşik | Önem |
| --- | --- | --- |
| Başarısız giriş yoğunluğu | 1 saatte 20 (işletme başına) | kritik |
| Reddedilen bilet onayı | 1 saatte 15 (kişi başına) | uyarı |
| Toplu iptal | 10 dakikada 20 (işletme başına) | kritik |
| Sık veri dışa aktarma | 24 saatte 6 (kişi başına) | uyarı |
| Ödeme tutarı uyuşmazlığı | 1 (tek bir tanesi bile) | kritik |
| Yeni adresten giriş | ilk kez görülen adres | bilgi |

**Uyarı fırtınası olmuyor.** `alerts.dedupe_key` içinde bir **zaman kovası** var (`kural:hedef:saat`) ve ekleme `ON CONFLICT (dedupe_key) DO NOTHING` ile yapılıyor. Bunun iki sonucu var: bekleme süresi bedavaya geliyor (500 başarısız giriş tek uyarı üretir, 500 e-posta değil), ve "önce bak, sonra yaz" yarışı hiç doğmuyor — kontrol veritabanında, kodda değil.

**E-posta gövdesinde kişisel veri yoktur.** Uyarı hangi kuralın kaç kez tetiklendiğini ve nerede bakılacağını söyler; kim, hangi adresten, hangi kayıt — bunların cevabı yalnızca işlem günlüğünde. E-posta üçüncü bir sağlayıcının sunucularından geçip orada saklanıyor; korumaya çalıştığımız veriyi oraya taşımak tuhaf olurdu. Aynı sebeple IP adresi `alerts` tablosuna da yazılmıyor.

`ALERT_EMAIL_TO` tanımsızsa iş **başarısız sayılır** ve zamanlayıcı hata görür. Uyarı üretip kimseye haber vermemek, uyarı sisteminin var olma sebebini ortadan kaldırırdı. Uyarılar yine de kaydedilir, `/isletme/gunluk` üzerinde bayrak olarak görünür ve bir sonraki koşum göndermeyi tekrar dener.

`verify-alerts.mjs` (25 kontrol) eşiğin altının uyarı üretmediğini, aynı olayın 50 kez tekrarında tek uyarı kaldığını, **12 ayrı süreç aynı anda süpürdüğünde yalnızca birinin uyarı oluşturduğunu** ve e-posta gövdesinde IP ile hesap kimliğinin geçmediğini doğrular.

### Bilinen sınırlar

Bunlar eksik iş değil, **bilinçli olarak çizilmiş sınırlar.** Her biri neden öyle olduğuyla birlikte yazılı:

1. **iyzico bağdaştırıcısı gerçek anahtarla sınanmadı.** Ödeme akışının doğruluk iddialarının tamamı (yarış, süre aşımı, kurcalanmış tutar, iade idempotanlığı) aynı sözleşmeyi uygulayan `fake` sağlayıcıyla ve gerçek eşzamanlılıkla kanıtlandı; bu iddiaların hiçbiri sağlayıcıya özgü değil, hepsi bizim kodumuzda. Sağlayıcıya özgü olan **yalnızca imzalama ve alan adlarıdır** ve o kısım ilk sandbox anahtarıyla sınanmalıdır.
2. **Yedekleme yoktur.** Veritabanı barındırma sağlayıcısının kendi düzenine bırakılmış; geri yükleme hiç denenmedi. İhlal müdahale planındaki kalan tek yapısal eksik budur ve bir sonraki önceliktir.
3. **Tespit kuralları sabit eşiklidir.** Kurallar her işletme için aynı sayıyı kullanır; günde 400 rezervasyon alan bir işletmeyle 20 alan aynı eşiğe tabidir. Davranışa göre uyarlanan eşikler daha isabetli olurdu ama ölçülecek geçmiş veri henüz yok.
4. **Görsel moderasyonu yoktur.** Yüklenen fotoğraf teknik olarak doğrulanır (tür, boyut, üstveri) ama içeriğine bakılmaz; uygunsuz görsel bildirim üzerine kaldırılır. İşletme veri sözleşmesi sorumluluğu işletmeye verir.
5. **Fatura/e-arşiv entegrasyonu yoktur.** Komisyon faturası elle kesilir.
6. **İkinci faktörü olmayan eski hesaplar.** Bu özellikten önce açılmış işletme hesaplarında numara yok; parolayla girmeye devam eder ve ekip ekranında uyarı görürler. Numara eklenene kadar tek katmanlıdırlar.
7. **Harita karoları dış bağımlılıktır.** Uygulamanın tek dış isteği budur ve kaçışı yoktur. Sağlayıcı kullanıcı IP'lerini görür — KVKK aydınlatma metninde yer alır.

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
node scripts/verify-nearby.mjs        # konuma göre sıralama ve konumun ağa ÇIKMADIĞI
node scripts/verify-permissions.mjs   # üç rolün hangi ekrana girip giremediği
node scripts/verify-equipment.mjs     # ekipman kapasitesi ve gerçek yarış — sunucu gerekmez
node scripts/verify-manual-booking.mjs # elle kayıt aynı kapasiteyi tüketiyor mu
node scripts/verify-audit.mjs         # işlem günlüğü: ne kaydediliyor, ne KAYDEDİLMİYOR
node scripts/verify-rate-limit.mjs    # hız sınırı ve 30 süreçli eşzamanlılık
node scripts/verify-jobs.mjs          # zamanlayıcı ucunun yetkilendirmesi
SERVER_LOG=… node scripts/verify-otp.mjs  # SMS doğrulama ve işletme 2FA
node scripts/verify-account-rights.mjs # veri indirme ve hesap silme (KVKK md. 11)

# Ödeme (sunucu PAYMENT_PROVIDER=fake ile başlatılmış olmalı):
PAYMENT_PROVIDER=fake npm start > server.log &
SERVER_LOG=server.log node scripts/verify-payment.mjs  # yarış, süre aşımı, kurcalama, iade
SERVER_LOG=server.log node scripts/verify-payouts.mjs  # hak ediş: bloke, serbest bırakma yarışı, onay
SERVER_LOG=server.log node scripts/verify-platform.mjs # yönetim paneli: yetki ayrımı, rozet, durdurma

SERVER_LOG=server.log node scripts/verify-wizard.mjs   # sihirbaz: adım akışı, önizleme = üretilen slot

node scripts/verify-uploads.mjs       # sahte dosya, bomba, EXIF/GPS temizliği, adet sınırı
node scripts/verify-weather.mjs       # hava hükmü, veri yokluğu, taşıma yarışı — sunucu gerekmez
node scripts/verify-branches.mjs      # şube süzgeci ve çoklu işletme erişimi (çerez elle yazılarak)
node scripts/verify-agency.mjs        # acente: aynı kapasite, hak ediş YOK, alanlar ayrı
SERVER_LOG=… node scripts/verify-links.mjs  # paylaşım linki: kanal formdan belirlenemiyor
node scripts/verify-signup.mjs        # self-servis kayıt: başvuru DOĞRULAMA değil
SERVER_LOG=… node scripts/verify-pricing.mjs # sezon/saat tarifesi, grup indirimi, tutar sunucuda

# Otomatik uyarılar (sunucu CRON_SECRET ve ALERT_EMAIL_TO ile başlatılmış olmalı):
SERVER_LOG=server.log node scripts/verify-alerts.mjs  # eşik, tekilleştirme, yarış, e-posta içeriği

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

## Durum

Ürün akışı uçtan uca tamam. Misafir aktiviteyi buluyor, saatini seçiyor, numarasını SMS ile doğruluyor, kartıyla ödüyor ve QR kodlu biletini alıyor. İşletme kendi aktivitelerini ekliyor, takvimini kuruyor, fotoğraflarını yüklüyor, bileti okutuyor ve gününü yönetiyor. Ödeme alınıyor, komisyon kesiliyor, iade gerektiğinde otomatik yapılıyor.

**Partner tarafı bir ilan paneli değil, operasyon sistemi.** Panel açıldığında ilk gelen soru "bugün ne var?" ve cevabı `/isletme/bugun`. Telefondan gelen rezervasyon aynı kapasiteyi tüketiyor, ekipman havuzu kişi sayısından bağımsız sınır koyuyor, katılım ve gelmeyen ayrı ayrı işaretleniyor. İkinci soru "ne kadar kazandım" ve cevabı `/isletme/finans`: ödeme alındığında işletmenin payı bloke ediliyor, hizmet verildiğinde serbest bırakılıyor — müşterinin ödemesi tek başına işletmenin kazancı değil.

Bunların hepsi **gerçek bir veritabanına** yazıyor (SQLite ya da Postgres, tek bir bağlantı dizesiyle seçilir) ve doğruluk iddiaları 30 süitle, ayrı işletim sistemi süreçleriyle, iki motorda birden sınanıyor.

### Bilinen sınır: iyzico onay akışı

Hak edişin serbest bırakılması sağlayıcıya `approve`/`disapprove` çağrısıyla iletiliyor ve **bu uçlar gerçek bir üye işyeri anahtarı olmadan çağrılamadı.** Doğruluk iddialarının tamamı — yarış, idempotanlık, gelmedi durumu, iade — sağlayıcıdan bağımsız ve bizim durum makinemizde; `fake` sağlayıcı aynı sözleşmeyi uyguluyor ve çağrıları kaydediyor, `verify-payouts.mjs` bunları sınıyor. Sağlayıcıya özgü olan yalnızca uç adresi ve alan adları; ilk gerçek anahtarla doğrulanmalı.

Yönetim panelinde (`/yonetim`) **ikinci faktör yok**; gerekçesi ve önerilen çözüm (SMS değil, WebAuthn) KURULUM.md 7b bölümünde.

**Canlıya çıkmak için kod tarafında yapılacak bir şey yok.** Kalanlar sizden gelmesi gerekenler — iyzico üye işyeri anahtarları, ETBİS kaydı, hukukçu onayı, SMS/e-posta/depolama anahtarları ve işletmelerin ticari bilgileri. Hepsi sırayla [KURULUM.md](KURULUM.md) içinde; o belge tamamlanmadan gerçek para tahsil edilmemelidir.

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
lib/                  veri modeli, oturum, görsel işleme ve biçimlendirme
lib/db/               şema; aktivite, slot, rezervasyon, ödeme ve kullanıcı depoları
lib/payments/         sağlayıcı soyutlaması (iyzico | fake) ve ödeme akışı
lib/storage/          dosya deposu (local | vercel-blob)
lib/alerts/           tespit kuralları ve uyarı üretimi
lib/jobs/             zamanlanmış işler — HTTP ucu ve komut satırı aynı kodu çağırır
lib/sms/, lib/mail/   giden mesaj sağlayıcıları (console varsayılan)
public/               görseller ve marka varlıkları
scripts/              varlık üretimi ve 30 doğrulama süiti
reference/prototypes/ özgün statik Stitch ekranları (build'e dahil değil)
legal/                KVKK ve mesafeli satış metinleri — TASLAK, hukukçu onayı bekliyor
```

## Sonraki geliştirme hedefi

Öncelik sırasıyla:

1. **Otomatik yedekleme ve geri yükleme tatbikatı.** İhlal müdahale planındaki kalan tek yapısal eksik; fidye yazılımı ya da hatalı toplu silme senaryosunda bedeli en ağır olan şey.
2. **iyzico sandbox anahtarıyla uçtan uca koşum** — bağdaştırıcının imzalama ve alan adlarını gerçek sağlayıcıya karşı doğrulamak.
3. **Fatura/e-arşiv entegrasyonu** ve işletmeye hakediş raporu ekranı.

Kapsam dışı bırakılanlar: çoklu para birimi, taksit seçenekleri, görsel moderasyon kuyruğu ve uygulama içi bildirim. Bunların hiçbiri pilotu engellemiyor.
