# Yayına Alma Rehberi

Kod tarafı bitti. Bu belge, **sizden gelmesi gereken** şeyleri sırayla listeler.
Her adımın neden gerektiği ve atlanırsa ne olacağı yazılı.

Yazılım tarafında yapılacak bir iş kalmadıysa, sıra bu listede.

---

## 0. Kısa özet

| # | Ne gerekiyor | Kimden | Olmadan ne olur |
| --- | --- | --- | --- |
| 1 | Şirket bilgileri (unvan, adres, MERSİS, KEP) | Sizden | Hukuki metinler `[…]` boşluklarıyla kalır, yayımlanamaz |
| 2 | Hukukçu onayı | Avukatınızdan | Metinler "TASLAK" bayrağıyla ve `noindex` ile yayımlanır |
| 3 | Postgres bağlantı dizesi | Barındırma sağlayıcısından | Veriler kalıcı olmaz, her dağıtımda kaybolur |
| 4 | `SESSION_SECRET` | Kendiniz üretirsiniz | Oturum çerezleri taklit edilebilir |
| 5 | MapTiler anahtarı | Ücretsiz hesap | Harita yerine yapılandırma uyarısı görünür |
| 6 | Alan adı | Sizden | Bilet QR'ları ve paylaşım bağlantıları yanlış adresi gösterir |
| 6b | iyzico üye işyeri + ETBİS kaydı + mesafeli satış metinleri | Sizden, Bakanlıktan, avukatınızdan | Online ödeme kapalı kalır; ücret deneyim yerinde alınır |
| 6c | İşletmelerin vergi no, IBAN ve yetkili bilgisi | İşletmelerden | O işletmenin aktiviteleri online ödemeye açılamaz |
| 6d | `CRON_SECRET` | Kendiniz üretirsiniz | Zamanlanmış işler kapalı kalır; ödemesi yarım kalan rezervasyonlar slotları kilitler |
| 6e | SMS sağlayıcı anahtarı (Netgsm) | Sağlayıcıdan | Doğrulama kodları kimseye ulaşmaz, yalnızca sunucu günlüğüne yazılır |
| 6f | Vercel Blob anahtarı | Vercel panelinden | Yüklenen görseller her dağıtımda kaybolur, sayfada kırık kutular kalır |
| 6g | E-posta sağlayıcısı + `ALERT_EMAIL_TO` | Resend + ihlal planındaki sorumlular | Güvenlik uyarıları üretilir ama kimseye gitmez; `uyarilar` işi hata verir |
| 7 | İlk işletme hesapları | Sizden | İşletmeler giriş yapamaz |
| 8 | Yurt dışına aktarım sözleşmesi | Avukatınızdan | KVKK md. 9 ihlali |

---

## 1. Şirket bilgileri

`legal/` klasöründeki metinlerde `[…]` biçiminde işaretli boşluklar var:

- `[Şirket Unvanı]`
- `[Açık adres]`
- `[MERSİS]`
- `[kvkk@ornek.com]` — KVKK başvurularını karşılayacak e-posta
- `[KEP adresi]`
- İhlal müdahale planındaki rol tablosu: kim sorumlu, telefonu ne

Bunları doldurmak için şirket kuruluşunun tamamlanmış olması gerekir.

**Nerede kullanılıyor:** Bu metinler sitede `/aydinlatma`, `/gizlilik`,
`/cerez-politikasi` ve `/kvkk-basvuru` adreslerinde **doğrudan bu markdown
dosyalarından** okunur. İkinci bir kopya yok; dosyayı düzeltmek siteyi
düzeltir.

## 2. Hukukçu onayı

Metinlerin başında şu blok duruyor:

```
> **TASLAK — hukukçu onayı alınmadan yayımlanmamalıdır.**
```

Bu blok durduğu sürece sayfa:

- üstte kırmızı "Bu metin taslaktır" bayrağı gösterir,
- `noindex` ile arama motorlarına kapalı kalır.

**Onay geldiğinde markdown dosyasının başındaki bu uyarı bloğunu silmeniz
yeterli.** Sayfa kendiliğinden yayın hâline geçer; kod değişikliği gerekmez.

Avukatınıza sorulacak noktalar `legal/README.md` içinde altı madde hâlinde
listelendi — hukuki sebep seçimi, yurt dışına aktarım, saklama süreleri,
işletmelere aktarım, çocuk verisi ve VERBİS.

## 3. Postgres

**Bu adım atlanamaz.** SQLite dosya tabanlıdır ve Vercel'in sunucusuz
ortamında kalıcı değildir: her dağıtımda ve çoğu zaman her istekte dosya
sıfırlanır. Rezervasyonlar kaybolur.

Bir Postgres alın (Neon, Supabase, Vercel Postgres, AWS RDS — hangisi olursa)
ve bağlantı dizesini ortam değişkeni olarak verin:

```
DATABASE_URL=postgresql://kullanici:parola@host:5432/rastla
```

Başka bir şey gerekmez: **şema ilk bağlantıda kendiliğinden kurulur.** Ayrı
bir göç komutu yok.

TLS davranışı gerekirse `DATABASE_SSL` ile ayarlanır:
- boş (varsayılan) → TLS kullanılır, sertifika zinciri doğrulanmaz
- `strict` → sertifika doğrulanır
- `off` → TLS kapalı (yalnızca yerel geliştirme)

### Yedekleme

Uygulama yedek almaz; bu, seçtiğiniz Postgres hizmetinin sorumluluğundadır.
Sağlayıcı panelinden **otomatik yedeklemeyi açın** ve saklama süresini
`legal/veri-saklama-imha-politikasi.md` ile uyumlu seçin. Yedeğin geri
yüklenebildiğini bir kez deneyin — denenmemiş yedek, yedek sayılmaz.

## 4. Oturum anahtarı

```bash
openssl rand -base64 32
```

Çıktıyı `SESSION_SECRET` olarak verin. Bu anahtar oturum çerezlerini imzalar;
sızarsa sahte çerez üretilip başkasının rezervasyonları görülebilir (ihlal
planında bu senaryo var).

Anahtarı değiştirmek tüm oturumları geçersiz kılar — bir sızıntı şüphesinde
yapılacak ilk şey budur.

## 5. Harita anahtarı

`NEXT_PUBLIC_MAPTILER_KEY` — [maptiler.com](https://www.maptiler.com/)
üzerinden ücretsiz alınır. Tanımlı değilse arama ekranında harita yerine
yapılandırma uyarısı görünür; liste görünümü çalışmaya devam eder.

**KVKK notu:** Harita karoları kullanıcının tarayıcısından doğrudan
sağlayıcıya gider, yani sağlayıcı kullanıcı IP'lerini görür. Bu, aydınlatma
metninde zaten yazılı (bölüm 2.3 ve 6). Uygulamanın **tek** dış isteği budur;
font, ikon ve görsellerin hepsi yerel paketlenir ve
`scripts/verify-offline.mjs` bunu her koşumda doğrular.

## 6. Alan adı

```
NEXT_PUBLIC_SITE_URL=https://rastla.com
```

Bilet QR kodları bu adresi taşır, sitemap ve paylaşım bağlantıları buradan
üretilir. Yanlış olursa basılı/ekranda gösterilen QR kodlar çalışmaz.

**Ödeme açıldığında bu adres ayrıca kritiktir:** ödeme sağlayıcısının
kullanıcıyı geri göndereceği adres buradan türetilir. Yanlış ya da erişilemez
bir adres, ödemesi alınmış ama onaylanamamış rezervasyonlar demektir.

## 6b. Ödeme (isteğe bağlı ama para almak için zorunlu)

Online ödeme **iki koşul birden** sağlanınca açılır:

1. `IYZICO_API_KEY` ve `IYZICO_SECRET_KEY` tanımlı.
2. İşletmenin **alt üye işyeri anahtarı** var (aşağıya bakın).

İkisinden biri eksikse sistem çalışmaya devam eder; rezervasyon doğrudan
onaylanır ve ücret deneyim yerinde alınır. Bu, yarım bir kurulum değil,
bilinçli bir çalışma biçimidir.

### Sıra

1. **Şirket kurulu olmalı.** iyzico üye işyeri başvurusu şahıs ya da sermaye
   şirketi ister; şahsi hesapla pazaryeri modeli açılmaz.
2. **ETBİS kaydı.** Para akışına girdiğiniz an *elektronik ticaret aracı
   hizmet sağlayıcı* olursunuz (6563 sayılı Kanun). Kayıt Ticaret
   Bakanlığı üzerinden yapılır.
3. **Mesafeli satış sözleşmesi ve ön bilgilendirme formu.** Bunlar olmadan
   yasal olarak tahsilat yapılamaz. Metinlerin hukukçu onayı gerekir.
4. **iyzico anahtarlarını girin**, önce sandbox ile deneyin
   (`IYZICO_SANDBOX` boş bırakılırsa sandbox kullanılır).
5. **Her işletme kendi ticari bilgilerini girer:** `/isletme/odeme-ayarlari`
   ekranından vergi/kimlik numarası, IBAN ve adres kaydedilir, ardından
   "ödeme sağlayıcısına gönder" ile alt üye işyeri açılır.

### Zamanlanmış iş

`CRON_SECRET` tanımlı olmalı ve `vercel.json` içindeki `odeme-suresi` işi
çalışıyor olmalı. Çalışmazsa ödemesi yarım kalan rezervasyonlar slotları
süresiz kilitli tutar. Elle kontrol:

```bash
npm run gorev -- odeme-suresi
```

### İptal politikası

`FREE_CANCELLATION_HOURS` (varsayılan 24) müşteri iptalinde tam iade
eşiğidir. **Bu değer ön bilgilendirme formunda yazan süreyle aynı olmalı** —
farklı olursa formdaki taahhüt bağlayıcıdır. Hava ve işletme kaynaklı
iptalde iade koşulsuz ve tamdır; müşteri kusurlu değildir.

## 6c. Görsel deposu

İşletmeler kendi aktivite fotoğraflarını yükleyebiliyor. Dosyalar bir depoda,
kayıtları veritabanında tutulur.

```
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

Vercel panelinden **Storage → Blob** ile oluşturulur ve anahtar projeye
otomatik eklenir.

**Anahtar tanımsızsa dosya sistemi kullanılır ve bu üretimde yeterli
DEĞİLDİR:** Vercel'in sunucusuz ortamında yazılan dosya bir sonraki dağıtımda
kaybolur. Kayıt veritabanında durduğu için sayfada kırık görsel kutuları
görünür. `DATABASE_URL` için geçerli uyarının aynısı.

**KVKK notu:** Görseller **bizim alan adımızdan** sunulur (`/gorsel/[id]`),
doğrudan blob adresinden değil. Böylece ziyaretçinin tarayıcısı yeni bir dış
host'a istek atmaz ve depo sağlayıcısı kullanıcı IP'lerini görmez. Aydınlatma
metninde ek bir alıcı saymanız gerekmiyor.

Yüklenen her fotoğraf sunucuda yeniden kodlanır ve **konum dahil tüm EXIF
verisi silinir.** İşletmenin telefonuyla çektiği fotoğraf çekim koordinatını
taşır; bu bilgi işletme adına yayımlanmamalı. `verify-uploads.mjs` bunu her
koşumda GPS taşıyan gerçek bir dosyayla doğrular.

## 7. İlk işletme hesapları

Sunucuda bir kez:

```bash
npm run seed
```

Her işletme için bir sahip hesabı açar ve parolasını **yalnızca bir kez**
ekrana yazar. Parolayı kaydedin.

Gerçek işletmelerinizi eklemek için:

```bash
npm run operator:create -- add-operator kirlangic-marina "Kırlangıç Marina"
npm run operator:create -- add-user kirlangic-marina ahmet@ornek.com "Ahmet Yılmaz" owner
```

Sonrası uygulamadan yürür: sahip `/isletme/ekip` üzerinden personel ekler,
parola sıfırlar, ayrılan çalışanı askıya alır. Askıya alınan hesabın oturumu
**anında** düşer.

Parola tamamen kaybolursa:

```bash
npm run operator:create -- reset ahmet@ornek.com
```

> Hesaplar kişiye özeldir. Aynı hesabı iki kişinin kullanması, bir
> uyuşmazlıkta "bileti kim onayladı" sorusunu yeniden cevapsız bırakır —
> sistemin bu sorusunu cevaplayabilmesi için tek sebep hesapların kişisel
> olmasıdır.

## 8. Yurt dışına aktarım

Barındırma (Vercel) ve harita sağlayıcısı (MapTiler) yurt dışında. 7499 sayılı
Kanun'la değişen KVKK md. 9 uyarınca **standart sözleşme** gerekiyor ve
imzalanmasından itibaren **5 iş günü içinde** Kişisel Verileri Koruma
Kurumu'na sunulmalı.

Hangi mekanizmanın uygun olduğu (standart sözleşme / taahhütname) ve kimin
imzalayacağı avukatınızla netleşmeli. `legal/README.md`'de 2. madde.

---

## Ortam değişkenleri — tam liste

`.env.example` dosyasını `.env.local` olarak kopyalayıp doldurun. Vercel'de
proje ayarlarından girilir.

| Değişken | Zorunlu | Ne işe yarar |
| --- | --- | --- |
| `DATABASE_URL` | **Evet** (üretimde) | Postgres bağlantı dizesi. Tanımsızsa yerel SQLite dosyası kullanılır — üretimde veri kaybı demektir. |
| `SESSION_SECRET` | **Evet** | Oturum çerezlerini imzalar. |
| `NEXT_PUBLIC_SITE_URL` | **Evet** | Bilet QR'ı, sitemap, paylaşım bağlantıları. |
| `NEXT_PUBLIC_MAPTILER_KEY` | Hayır | Harita. Yoksa liste görünümü çalışır, harita uyarı gösterir. |
| `DATABASE_SSL` | Hayır | `strict` / `off`. Varsayılan: TLS açık, zincir doğrulanmaz. |
| `DATABASE_POOL_MAX` | Hayır | Postgres bağlantı havuzu üst sınırı (varsayılan 10). |
| `DATABASE_PATH` | Hayır | SQLite dosya yolu. Yalnızca `DATABASE_URL` yokken. |
| `CRON_SECRET` | **Evet** | Zamanlanmış iş uçlarını korur. **Tanımsızsa uçlar kapalıdır** ve ödeme süresi aşımı süpürülmez. |
| `IYZICO_API_KEY` / `IYZICO_SECRET_KEY` | Ödeme alınacaksa | Üye işyeri anahtarları. İkisi de yoksa online ödeme kapalı kalır. |
| `IYZICO_SANDBOX` | Hayır | `0` verilirse üretim ucu. Varsayılan sandbox. |
| `PAYMENT_TIMEOUT_MINUTES` | Hayır | Ödemesi bekleyen rezervasyonun düşürülme süresi (varsayılan 20). |
| `FREE_CANCELLATION_HOURS` | Hayır | Müşteri iptalinde tam iade eşiği (varsayılan 24). Ön bilgilendirme formuyla aynı olmalı. |
| `PAYMENT_PROVIDER` | **Hayır — üretimde asla** | Yalnızca test. `fake` verilirse ödeme alınmadan bilet üretilir. |
| `BLOB_READ_WRITE_TOKEN` | **Evet** (görsel yüklenecekse) | Yüklenen görsellerin deposu. Yoksa dosya sistemi kullanılır ve **sunucusuz ortamda dosyalar kaybolur.** |
| `STORAGE_PROVIDER` / `UPLOAD_PATH` | Hayır | Depoyu `local`'a zorlar; yerel kök dizini belirler. |

---

## Yayına aldıktan sonra

### Aylık: saklama süresi

```bash
npm run retention              # ne silineceğini gösterir, silmez
npm run retention -- --uygula  # gerçekten siler
```

### Beş dakikada bir: ödeme süresi

`vercel.json` içindeki `odeme-suresi` işi ödemesi yarım kalan rezervasyonları
düşürür ve slot kapasitesini geri verir. Vercel Cron bunu kendiliğinden
çağırır; elle çalıştırmak için:

```bash
npm run gorev -- odeme-suresi
```

Bu iş çalışmıyorsa yerler boşuna kilitli kalır — doğrudan kaybedilen satış
demektir. `CRON_SECRET` tanımlı değilse uç kapalıdır ve iş hiç tetiklenmez.

### On beş dakikada bir: güvenlik uyarıları

`uyarilar` işi tespit kurallarını çalıştırır ve yeni bulguları
`ALERT_EMAIL_TO` adreslerine bildirir. Bu adresler **ihlal müdahale planındaki
sorumlular** olmalı (bkz. `legal/veri-ihlali-mudahale-plani.md`, Bölüm 3).

```bash
npm run gorev -- uyarilar
```

`ALERT_EMAIL_TO` tanımsızsa iş **hata verir** ve zamanlayıcı bunu görür.
Bilinçli: uyarı üretip kimseye haber vermemek, uyarı sisteminin var olma
sebebini ortadan kaldırırdı. Uyarılar yine de kaydedilir ve işletme
`/isletme/gunluk` ekranında bayrak olarak görür.

**Uyarı e-postaları kişisel veri içermez** — kim, hangi adresten ve hangi
kayıt sorularının cevabı yalnızca işlem günlüğündedir. Bu yüzden bir uyarı
geldiğinde günlüğe bakılması gerekir; e-posta tek başına yeterli bilgi
vermez ve vermemelidir.

İşlem günlüğündeki IP ve tarayıcı bilgisi kişisel veridir; 12 ay sonunda
silinir. Hız sınırı sayaçları 24 saat sonra temizlenir. **Veri tutmak kadar
zamanında silmek de bir yükümlülüktür.**

Bu komutu zamanlanmış bir işe bağlayın (Vercel Cron ya da sunucu crontab'ı).

### Haftalık: işlem günlüğü

İşletme sahibi `/isletme/gunluk` ekranını gözden geçirsin. Ekran, son 24
saatte 10'u aşan başarısız giriş denemesinde kendiliğinden uyarı gösterir.

Şüpheli bir durumda: ilgili hesabı `/isletme/ekip` üzerinden askıya alın
(oturumu anında düşer), sonra parolasını sıfırlayın.

### Yılda bir: ihlal tatbikatı

`legal/veri-ihlali-mudahale-plani.md` madde 8: bir senaryo seçilip adımlar
kâğıt üzerinde yürütülür, eksikler kaydedilir. Sezon açılışından önce
(Nisan) yapılması önerilir.

---

## Doğrulama

Kod tarafında hiçbir şeyin bozulmadığından emin olmak için:

```bash
npm ci
npm run lint
npm run build
npm run seed

# Sunucu gerekmeyen süitler
node scripts/verify-redemption.mjs
node scripts/verify-capacity.mjs
node scripts/verify-accounts.mjs
node scripts/verify-rate-limit.mjs

# Sunucu ayaktayken (npm start)
node scripts/verify-operator-flow.mjs
node scripts/verify-ticket-flow.mjs
node scripts/verify-audit.mjs
node scripts/verify-account-rights.mjs
node scripts/verify-interactions.mjs
node scripts/verify-offline-ticket.mjs
node scripts/verify-offline.mjs

# Sunucu CRON_SECRET=gizli-cron-anahtari ile başlatılmışken
node scripts/verify-jobs.mjs

# Sunucu SERVER_LOG'a yazarken (SMS sağlayıcısı yokken kodlar oraya düşer)
SERVER_LOG=server.log node scripts/verify-otp.mjs

# Sunucu PAYMENT_PROVIDER=fake ile başlatılmışken
SERVER_LOG=server.log node scripts/verify-payment.mjs

# Görsel yükleme: sahte dosya, sıkıştırma bombası, EXIF/GPS temizliği
node scripts/verify-uploads.mjs

# Otomatik uyarılar (sunucu ALERT_EMAIL_TO ile de başlatılmış olmalı)
SERVER_LOG=server.log node scripts/verify-alerts.mjs

# Postgres'e karşı
DATABASE_URL=… node scripts/verify-postgres.mjs
```

Bu süitler ürünün en kritik iddialarını sınar: bir biletin yalnızca bir kez
onaylanabildiğini, slot kapasitesinin aşılamadığını, silinen hesabın gerçekten
geri döndürülemez olduğunu. Hepsi **ayrı işletim sistemi süreçleriyle**, yani
gerçek eşzamanlılıkla çalışır.
