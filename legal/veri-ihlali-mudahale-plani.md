# Veri İhlali Müdahale Planı

> **TASLAK — hukukçu onayı alınmadan yürürlüğe konmamalıdır.**
> İç dokümandır. Yayımlanmaz, ancak talep hâlinde ibraz edilebilmelidir.
> Son güncelleme: [tarih]

## 0. Önce bunu okuyun — ilk 5 dakika

Bir ihlalden şüphelendiyseniz:

1. **Kanamayı durdurun.** Sızıntının kaynağını kapatın (erişimi iptal et, anahtarı değiştir, sunucuyu kapat). Kanıtları silmeyin.
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
| **İşletme erişim kodu sızdı** (`OPERATOR_ACCESS_CODES`) | Beklenmeyen saatte/konumda işletme oturumu; okutulmayan biletlerin onaylanması | İlgili işletmenin kodunu değiştir, oturumları geçersiz kıl | Yüksek — o işletmenin tüm misafir ad ve telefonları görülmüş olabilir |
| **`SESSION_SECRET` sızdı** | Kod deposunda/ortam değişkeninde ifşa | Anahtarı değiştir; tüm oturumlar geçersizleşir | Yüksek — sahte oturum çerezi üretilip başkasının rezervasyonları görülebilir |
| **Veritabanı dosyası/yedeği ifşa oldu** | Yetkisiz erişim kaydı, yanlış yapılandırılmış depolama | Erişimi kes, kimlik bilgilerini döndür | **Kritik** — tüm misafir ad, telefon ve rezervasyon geçmişi |
| **Barındırma sağlayıcısında ihlal** | Sağlayıcı bildirimi | Sağlayıcıdan kapsam bilgisi iste, kendi anahtarlarını döndür | Kapsama göre |
| **İşletme personeli misafir listesini dışarı çıkardı** | Misafir şikâyeti, beklenmeyen pazarlama iletisi | İşletme erişimini askıya al, sözleşme md. 4.1 ihlali | Orta-yüksek |
| **Bilet kodu tahmin edildi** | Aynı IP'den çok sayıda başarısız kod denemesi | Hız sınırı uygula | Düşük — kod 160 bit rastgele; pratikte tahmin edilemez |
| **Yanlış misafire bildirim gitti** | Misafir şikâyeti | Kaydı düzelt | Düşük-orta |

> **Not:** Ödeme altyapısı henüz yok, kart verisi işlenmiyor. Ödeme devreye girdiğinde bu tablo yeniden yazılmalıdır.

## 5. Müdahale adımları

### Adım 1 — Tespit ve kayıt (0. saat)

İhlalin öğrenildiği **tarih ve saati** yazılı olarak kaydedin. 72 saat buradan işler.

Kaydedin: kim fark etti, nasıl fark edildi, ilk belirtiler neler.

### Adım 2 — Sınırlama (ilk 1 saat)

- Sızıntı kaynağını kapatın
- Sızdığından şüphelenilen tüm sırları döndürün (`SESSION_SECRET`, işletme kodları, veritabanı kimlik bilgileri, API anahtarları)
- **Günlükleri ve yedekleri koruyun** — silmeyin, üzerine yazmayın

### Adım 3 — Değerlendirme (ilk 24 saat)

Şu soruları yanıtlayın:

1. Hangi **veri kategorileri** etkilendi? (ad, telefon, rezervasyon geçmişi)
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
| Kart verisi işlenmiyor | ✅ var (ödeme yok) |
| İşletme başına ayrı erişim kodu | ✅ var |
| **Kişi bazında işletme hesabı ve rol yönetimi** | ❌ yok — kod paylaşımlı |
| **SMS ile kimlik doğrulama (OTP)** | ❌ yok — oturum cihaza bağlı |
| **Erişim günlüğü ve anormallik tespiti** | ❌ yok |
| **Otomatik yedekleme ve geri yükleme testi** | ❌ yok |
| **Hız sınırı (brute force koruması)** | ❌ yok |

> Sağ sütundaki ❌'ler bu planın en zayıf noktalarıdır: **ihlali fark edecek mekanizma yok.** Erişim günlüğü olmadan "kim ne zaman neye erişti" sorusuna cevap verilemez, bu da Adım 3'teki kapsam tespitini imkânsıza yakın kılar. Öncelik sırası: erişim günlüğü → hız sınırı → kişi bazında hesap → OTP.

## 8. Tatbikat

Bu plan **yılda en az bir kez** masabaşı tatbikatla sınanır: bir senaryo seçilir, adımlar kâğıt üzerinde yürütülür, eksikler kaydedilir.

Sezon açılışından önce (Nisan) yapılması önerilir.
