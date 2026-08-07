# Veri İhlali Müdahale Planı

> **TASLAK — hukukçu onayı alınmadan yürürlüğe konmamalıdır.**
> İç dokümandır. Yayımlanmaz, ancak talep hâlinde ibraz edilebilmelidir.
> Son güncelleme: [tarih]

## 0. Önce bunu okuyun — ilk 5 dakika

Bir ihlalden şüphelendiyseniz:

1. **Kanamayı durdurun.** Sızıntının kaynağını kapatın (şüpheli hesabı `/isletme/ekip` üzerinden askıya alın — oturumu anında düşer; anahtarı değiştirin; gerekirse sunucuyu kapatın). Kanıtları silmeyin.
2. **Saati not edin.** 72 saatlik bildirim süresi, ihlali **öğrendiğiniz an** başlar. Bu anı yazın.
3. **[İhlal sorumlusu]'nu arayın:** [telefon]. Tek başınıza karar vermeyin.
4. **Hiçbir şeyi silmeyin, kimseye duyurmayın.** Günlükler ve yedekler delildir.

---

## 1. Amaç ve kapsam

Bu plan, **[Şirket Unvanı]**'nda kişisel veri ihlali yaşandığında izlenecek adımları belirler. KVKK md. 12/5 uyarınca ihlal, öğrenildiği tarihten itibaren **gecikmeksizin ve en geç 72 saat içinde** Kişisel Verileri Koruma Kurulu'na bildirilir.

Kapsam: RASTLA platformu, veritabanı, sunucu altyapısı, işletme erişimleri ve personel cihazları.

## 2. İhlal nedir

Kişisel verilerin **hukuka aykırı olarak** ele geçirilmesi, ifşa edilmesi, değiştirilmesi, erişilemez hâle gelmesi veya yok olması.

Üç türü de ihlaldir:

| Tür | Örnek |
| --- | --- |
| **Gizlilik** ihlali | Misafir listesinin yetkisiz kişiye ifşası |
| **Bütünlük** ihlali | Rezervasyon kayıtlarının izinsiz değiştirilmesi |
| **Erişilebilirlik** ihlali | Veritabanının kalıcı kaybı, fidye yazılımı |

## 3. Roller

| Rol | Kişi | Sorumluluk |
| --- | --- | --- |
| İhlal sorumlusu | [Ad Soyad] · [telefon] | Süreci yönetir, bildirim kararını verir |
| Teknik sorumlu | [Ad Soyad] · [telefon] | Kapsamı tespit eder, kanamayı durdurur |
| Hukuki danışman | [Ad Soyad] · [telefon] | Bildirim yükümlülüğü ve içeriği |
| İletişim sorumlusu | [Ad Soyad] | İlgili kişilere ve işletmelere bildirim |

İhlal sorumlusuna ulaşılamıyorsa yedek: [Ad Soyad] · [telefon].

## 4. Bu sisteme özgü ihlal senaryoları

Genel bir liste değil — bu uygulamanın gerçek zayıf noktaları:

| Senaryo | Nasıl fark edilir | İlk hamle | Ağırlık |
| --- | --- | --- | --- |
| **İşletme personelinin parolası ele geçti** | Beklenmeyen saatte/konumda giriş; okutulmayan biletlerin onaylanması | İlgili hesabı `/isletme/ekip` üzerinden askıya al — oturumu anında düşer; ardından parolayı sıfırla | Yüksek — o işletmenin misafir ad ve telefonları görülmüş olabilir. Hangi hesabın kullanıldığı kayıtlıdır. |
| **`SESSION_SECRET` sızdı** | Kod deposunda/ortam değişkeninde ifşa | Anahtarı değiştir; tüm oturumlar geçersizleşir | Yüksek — sahte oturum çerezi üretilip başkasının rezervasyonları görülebilir |
| **Veritabanı bağlantı dizesi (`DATABASE_URL`) sızdı** | Beklenmeyen kaynaktan bağlantı, sağlayıcı uyarısı | Parolayı sağlayıcı panelinden değiştir, erişimi IP ile daralt | **Kritik** — tüm misafir ad, telefon ve rezervasyon geçmişi |
| **Barındırma sağlayıcısında ihlal** | Sağlayıcı bildirimi | Sağlayıcıdan kapsam bilgisi iste, kendi anahtarlarını döndür | Kapsama göre |
| **İşletme personeli misafir listesini dışarı çıkardı** | Misafir şikâyeti, beklenmeyen pazarlama iletisi | İşletme erişimini askıya al, sözleşme md. 4.1 ihlali | Orta-yüksek |
| **Bilet kodu tahmin edilmeye çalışıldı** | `/isletme/gunluk` içinde yoğun "Bilet onayı reddedildi" kaydı | Hız sınırı zaten devrede (5 dakikada 20 başarısız deneme); ilgili personel hesabını inceleyin | Düşük — kod 160 bit rastgele; pratikte tahmin edilemez |
| **Yanlış misafire bildirim gitti** | Misafir şikâyeti | Kaydı düzelt | Düşük-orta |
| **Ödeme tutarı kurcalanmaya çalışıldı** | Otomatik uyarı: `payment.denied` (tek bir tanesi bile uyarı üretir) | Uyarı e-postası gelir; günlükte ilgili rezervasyonu ve IP'yi inceleyin. Ödeme zaten reddedilmiştir, para alınmamıştır | Orta — **veri ihlali değil**, mali saldırı denemesidir. Kurul'a bildirim gerekmez ama kaydedilmelidir |
| **Ödeme sağlayıcısı anahtarları (`IYZICO_SECRET_KEY`) sızdı** | Beklenmeyen işlem, sağlayıcı uyarısı | Anahtarları sağlayıcı panelinden **derhal** döndür; sağlayıcıdan işlem dökümü iste | **Kritik** — sahte iade/işlem üretilebilir. Kart verisi sızmaz (bizde yok) ama **mali zarar doğar** |
| **İşletmenin IBAN/vergi bilgisi sızdı** | Veritabanı ihlaliyle birlikte | İşletmeleri bilgilendir; IBAN değişikliği önerilir | Orta — gerçek kişi/şahıs şirketi işletmelerde **TCKN kişisel veridir**, o hâlde Kurul'a bildirim gerekebilir |
| **Blob deposu anahtarı (`BLOB_READ_WRITE_TOKEN`) sızdı** | Sağlayıcı uyarısı, beklenmeyen dosya | Anahtarı döndür; yüklenen dosyaları gözden geçir | Düşük-orta — görseller zaten herkese açık içerik; EXIF silindiği için konum verisi taşımıyorlar |
| **Uyarı e-postaları kimseye gitmiyor** | `uyarilar` işi hata veriyor, `ALERT_EMAIL_TO` boş | Adresleri tanımla; iş bir sonraki koşumda göndermeyi tekrar dener | Yüksek — ihlal tespiti kâğıt üzerinde kalır |

> **Kart verisi hakkında:** Kart numarası, son kullanma tarihi ve CVV bu sistemde **hiçbir zaman işlenmez.** Ödeme, lisanslı ödeme kuruluşunun barındırdığı formda alınır; bize yalnızca işlem sonucu ve kartın son dört hanesi gelir.
>
> Bunun ihlal senaryosundaki karşılığı önemli: **veritabanımızın tamamı sızsa bile hiç kimsenin kartı kullanılamaz.** Kart verisi bakımından veri sorumlusu ödeme kuruluşudur; onların tarafındaki bir ihlalde bildirim yükümlülüğü de onlardadır. Yine de misafirlerimizi ilgilendiren bir olay olduğu için sağlayıcıdan kapsam bilgisi istenmeli ve gerekiyorsa Bölüm 5'teki bildirim yapılmalıdır.

## 5. Müdahale adımları

### Adım 1 — Tespit ve kayıt (0. saat)

İhlalin öğrenildiği **tarih ve saati** yazılı olarak kaydedin. 72 saat buradan işler.

Kaydedin: kim fark etti, nasıl fark edildi, ilk belirtiler neler.

**İlk bakılacak yer `/isletme/gunluk`.** Şüpheli hesabın son işlemleri, beklenmeyen saatlerdeki girişler ve başarısız giriş yoğunluğu buradadır. Ekranı sayfa sayfa kaydedin (ekran görüntüsü) — bu kayıtların saklama süresi 12 aydır.

### Adım 2 — Sınırlama (ilk 1 saat)

- Sızıntı kaynağını kapatın
- Sızdığından şüphelenilen tüm sırları döndürün (`SESSION_SECRET`, işletme kodları, veritabanı kimlik bilgileri, API anahtarları)
- **Günlükleri ve yedekleri koruyun** — silmeyin, üzerine yazmayın

### Adım 3 — Değerlendirme (ilk 24 saat)

Şu soruları yanıtlayın:

1. Hangi **veri kategorileri** etkilendi? (ad, telefon, rezervasyon geçmişi; işlem günlüğünde ayrıca IP ve tarayıcı bilgisi)
2. Kaç **kişi** ve kaç **kayıt**?
3. Veriler gerçekten **ele geçirildi mi**, yoksa yalnızca erişim mi mümkündü?
4. İlgili kişiler için **olası sonuçlar** neler? (istenmeyen iletişim, kimlik avı, rahatsız edilme)
5. **Özel nitelikli veri** var mı? *(Bu sistemde işlenmiyor — yoksa cevap "hayır")*

Sonucu **düşük / orta / yüksek** olarak sınıflandırın.

### Adım 4 — Kurul'a bildirim (en geç 72 saat)

**Karar kuralı: şüphe hâlinde bildirin.** Bildirmemenin yaptırımı, gereksiz bildirimden ağırdır.

Bildirim, Kurum'un [Veri İhlali Bildirim Formu](https://www.kvkk.gov.tr/) ile yapılır ve şunları içerir:

- İhlalin ne zaman ve nasıl gerçekleştiği
- Etkilenen kişi ve kayıt sayısı (yaklaşık olabilir)
- Etkilenen veri kategorileri
- Olası sonuçlar
- Alınan ve alınacak önlemler
- İhlal sorumlusunun iletişim bilgileri

72 saat içinde tüm bilgiler toplanamamışsa **gecikme gerekçesiyle birlikte kısmi bildirim** yapılır, eksikler sonradan tamamlanır.

### Adım 5 — İlgili kişilere bildirim

İhlal, ilgili kişilerin **hak ve özgürlükleri açısından risk** doğuruyorsa, etkilenen misafirlere **makul en kısa sürede** bildirim yapılır.

Bildirim kanalı: SMS (elimizdeki tek doğrudan kanal) ve platform üzerinde duyuru.

Bildirim **açık ve sade** olmalı:

```
RASTLA olarak sizi bilgilendirmemiz gereken bir durum var.
[tarih] tarihinde [kısaca ne oldu].
Etkilenen bilgileriniz: [ad, telefon].
Ödeme bilginiz etkilenmedi — sistemimizde kart bilgisi saklanmıyor.
Aldığımız önlemler: [...]
Sizin yapmanız gerekenler: [...]
Sorularınız için: [kvkk@ornek.com]
```

Suçlama, mazeret ve teknik jargon kullanılmaz.

### Adım 6 — İşletmelere bildirim

İhlal işletmelere aktarılan verileri kapsıyorsa, ilgili işletmeler bilgilendirilir.

İhlalin **kaynağı bir işletme** ise: erişimi askıya alın, İşletme Kişisel Veri Koruma Sözleşmesi md. 4.4 uyarınca yazılı bildirim isteyin.

### Adım 7 — Kayıt ve öğrenme

Her ihlal, sonucu ne olursa olsun **İhlal Kayıt Defteri**'ne (madde 6) işlenir. KVKK, bildirim yapılmasa dahi ihlallerin kayıt altına alınmasını gerektirir.

İhlalden sonraki iki hafta içinde: kök neden analizi yapın, tekrarı önleyecek değişikliği uygulayın, bu planı gerekiyorsa güncelleyin.

## 6. İhlal Kayıt Defteri

Her kayıt şunları içerir:

| Alan |
| --- |
| Kayıt no |
| İhlalin öğrenildiği tarih ve saat |
| İhlalin gerçekleştiği (tahmini) tarih |
| Nasıl fark edildi |
| Etkilenen veri kategorileri |
| Etkilenen kişi / kayıt sayısı |
| Değerlendirilen risk (düşük/orta/yüksek) |
| Kurul'a bildirildi mi? Tarih? Bildirilmediyse gerekçe |
| İlgili kişilere bildirildi mi? Tarih ve kanal |
| Alınan önlemler |
| Kök neden |
| Kapanış tarihi ve sorumlusu |

## 7. Önleyici tedbirler (mevcut durum)

| Tedbir | Durum |
| --- | --- |
| Oturum çerezleri imzalı ve HttpOnly | ✅ var |
| Bilet kodları kriptografik rastgelelikle üretiliyor (160 bit) | ✅ var |
| İşletme yalnızca kendi rezervasyonlarını görüyor | ✅ var |
| Bilet ve rezervasyon sayfaları arama motorlarına kapalı | ✅ var |
| Kart verisi **hiç işlenmiyor** — ödeme sağlayıcının barındırdığı formda alınır, bize yalnızca son dört hane gelir | ✅ var |
| Ödeme geri çağrısının sonucu **sağlayıcıdan sorulur**, geri çağrının gövdesine güvenilmez | ✅ var |
| Ödeme tutarı, para birimi ve eşleştirme kimliği kendi kaydımızla karşılaştırılır; uyuşmazsa reddedilir ve günlüğe düşer | ✅ var |
| Yüklenen görsellerden **tüm EXIF/GPS üstverisi silinir** | ✅ var |
| Yüklenen dosyanın türü **gerçek sihirli baytlarından** doğrulanır; sıkıştırma bombasına karşı piksel sınırı var | ✅ var |
| Kişi bazında işletme hesabı (e-posta + scrypt parola özeti) | ✅ var |
| Rol ayrımı: personel bilet okutur, yalnızca sahip fiyat/takvim/ekip yönetir | ✅ var |
| Askıya alınan hesabın oturumu anında geçersizleşir | ✅ var |
| Bileti onaylayan **kişi** kayıtlı (işletme değil) | ✅ var |
| **SMS ile numara doğrulama (müşteri)** ve **işletme girişinde ikinci faktör** | ✅ var |
| Doğrulama kodu düz metin saklanmıyor (tuzlu özet), günlüğe hiç yazılmıyor | ✅ var |
| İşlem günlüğü: giriş, bilet onayı, iptal, katalog değişikliği kişi bazında kayıtlı | ✅ var — `/isletme/gunluk` |
| Başarısız giriş denemeleri kayıtlı; günlük ekranı 24 saatte 10'u aşınca uyarı gösterir | ✅ var |
| **Otomatik anormallik tespiti ve e-posta bildirimi** | ✅ var — altı kural, 15 dakikada bir (`uyarilar` işi) |
| **Otomatik yedekleme ve geri yükleme testi** | ❌ yok |
| Hız sınırı: başarısız giriş, bilet onayı, rezervasyon ve doğrulama kodu | ✅ var |

> Adım 3'teki kapsam tespiti mümkün: işlem günlüğü "kim ne zaman neye erişti" sorusunu cevaplıyor ve otomatik kurallar şüpheli örüntüyü **kendiliğinden** haber veriyor (Bölüm 3'teki sorumlulara).
>
> **Kalan tek yapısal eksik yedeklemedir.** Veritabanı barındırma sağlayıcısının kendi yedekleme düzenine bırakılmış durumda; geri yükleme hiç denenmedi. Fidye yazılımı ya da hatalı toplu silme senaryosunda bunun bedeli ağır olur. Bir sonraki öncelik budur.
>
> **Uyarı e-postaları kişisel veri içermez** — hangi kuralın kaç kez tetiklendiğini ve günlüğe bakılması gerektiğini söyler. Bu bilinçli: e-posta üçüncü bir sağlayıcının sunucularında saklanıyor ve korumaya çalıştığımız veriyi oraya taşımak tuhaf olurdu. Uyarı geldiğinde **mutlaka `/isletme/gunluk` ekranına bakılmalıdır.**

## 8. Tatbikat

Bu plan **yılda en az bir kez** masabaşı tatbikatla sınanır: bir senaryo seçilir, adımlar kâğıt üzerinde yürütülür, eksikler kaydedilir.

Sezon açılışından önce (Nisan) yapılması önerilir.
