# Kişisel Veri Saklama ve İmha Politikası

> **TASLAK — hukukçu onayı alınmadan yürürlüğe konmamalıdır.**
> Bu bir iç dokümandır; yayımlanması zorunlu değildir ancak talep hâlinde ibraz edilebilmelidir.
> Son güncelleme: [tarih]

## 1. Amaç ve kapsam

Bu politika, **[Şirket Unvanı]** tarafından işlenen kişisel verilerin saklanma sürelerini ve bu süreler dolduğunda uygulanacak imha yöntemlerini belirler. Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik esas alınmıştır.

Kapsam: RASTLA platformu üzerinden işlenen müşteri ve işletme verileri.

## 2. Kayıt ortamları

| Ortam | İçerik |
| --- | --- |
| Uygulama veritabanı | Kullanıcı kayıtları, rezervasyonlar, biletler, aktiviteler, takvim ve slotlar |
| Sunucu günlükleri | Teknik hata ve erişim kayıtları |
| İşlem günlüğü (`audit_log`) | Kim, ne zaman, hangi işlemi yaptı: giriş denemeleri, bilet onayları, iptaller, aktivite ve takvim değişiklikleri. IP adresi ve tarayıcı bilgisi içerir. |
| Kullanıcı cihazı (tarayıcı) | Oturum çerezi, çevrimdışı görüntüleme için önbelleğe alınmış bilet sayfaları |

Kişisel veri içeren **fiziksel/kâğıt ortam bulunmamaktadır.**

## 3. Saklama süreleri

| Veri | Süre | Sürenin başlangıcı | Gerekçe |
| --- | --- | --- | --- |
| Kullanıcı kaydı (ad, telefon) | 10 yıl | Son rezervasyon tarihi | Genel zamanaşımı süresince hak tesisi ve savunma |
| Rezervasyon ve bilet kayıtları | 10 yıl | Rezervasyon tarihi | Aynı |
| İptal kayıtları | 10 yıl | İptal tarihi | Uyuşmazlık ihtimali |
| Oturum çerezi | 90 gün | Oluşturulma | Oturumun sürdürülmesi |
| Sunucu günlükleri | [12 ay] | Kayıt anı | Sistem güvenliği |
| İşlem günlüğü (IP ve tarayıcı bilgisi dahil) | [12 ay] | Kayıt anı | KVKK md. 12 güvenlik tedbiri; ihlal tespiti ve kapsam belirleme. Süresiz tutmak ayrıca ihlal olurdu. |
| Hız sınırı sayaçları (IP, e-posta, telefon) | 24 saat | Sayaç penceresinin başlangıcı | Kaba kuvvet ve kötüye kullanımın engellenmesi; pencere kapandıktan sonra hiçbir işlevi kalmaz |
| Ticari elektronik ileti izni / ret kaydı | Mevzuatın öngördüğü süre | İznin alınması / reddi | 6563 sayılı Kanun |
| **Ödeme kayıtları** (tutar, durum, sağlayıcı işlem no, kartın son dört hanesi) | [10 yıl] | İşlem tarihi | VUK md. 253 (5 yıl) ve TTK md. 82 (10 yıl) kesişimi; uzun olan esas alındı |
| **İade kayıtları** | [10 yıl] | İade tarihi | Aynı |
| **Mesafeli satış sözleşmesi onay zamanı** | [10 yıl] | Onay tarihi | Sözleşmenin kurulduğunun ispatı |
| Telefon doğrulama kayıtları (numara + kodun **özeti**) | **24 saat** | Kaydın oluşturulması | Kod 5 dakika yaşıyor; kayıt bir gün sonra hiçbir işe yaramaz ve telefon numarası içerdiği için bekletilmez |
| İşletmenin ticari verileri (vergi no, TCKN, IBAN, adres) | Sözleşme süresi + [10 yıl] | Sözleşmenin sona ermesi | Ticari defter ve hakediş uyuşmazlıkları |
| **Güvenlik uyarıları** (`alerts`) | [12 ay] | Uyarının oluşması | İşlem günlüğüyle aynı; uyarı zaten günlüğe işaret ediyor ve ondan uzun yaşamasının anlamı yok |
| Aktivite görselleri | Aktivite silinene kadar | — | İşletmenin kendi içeriği; kişisel veri içermemesi için EXIF üstverisi yükleme anında silinir |

**Kart numarası, son kullanma tarihi ve CVV hiçbir süre saklanmaz — hiç işlenmez.** Ödeme lisanslı kuruluşun kendi sayfasında alınır; bu veriler bakımından saklama yükümlülüğü de ona aittir.

> **[Hukukçu notu:** 10 yıllık süre TBK md. 146 genel zamanaşımı esas alınarak önerilmiştir. Ödeme kayıtları için VUK md. 253 (5 yıl) ile TTK md. 82 (10 yıl) kesişiyor; uzun olan alındı. Ancak **KVKK'nın "gerekli olan süreden fazla saklamama" ilkesi** ile ticari saklama yükümlülüğü arasındaki denge, özellikle kartın son dört hanesi gibi işlevi tartışmalı alanlar için değerlendirilmelidir — bu bilgi vergi mevzuatı bakımından zorunlu olmayabilir ve öyleyse daha kısa tutulmalıdır.]

## 4. İmha yöntemleri

| Ortam | Yöntem |
| --- | --- |
| Veritabanı kayıtları | Kaydın silinmesi; muhasebe/uyuşmazlık gereği tutulması gerekiyorsa kimlik ve iletişim alanlarının anonimleştirilmesi |
| İlgili kişinin kendi talebiyle hesap silme | Uygulamada (`/hesabim`) anında yapılır: ad ve telefon geri döndürülemez yer tutucularla değiştirilir. Rezervasyon kayıtları saklama süresi boyunca anonim hâlde kalır. |
| Sunucu günlükleri | Otomatik yaşlandırma ile silme |
| İşlem günlüğü | Yaşlandırma ile toplu silme (`npm run retention -- --uygula`) |
| Hız sınırı sayaçları | Aynı komutla silinir |
| Yedekler | Yedek döngüsü tamamlandığında üzerine yazma. Yedekleme, barındırılan Postgres hizmetinin sorumluluğundadır; saklama süresi sağlayıcı ayarlarından bu politikaya uygun seçilmelidir. |
| Kullanıcı cihazındaki önbellek | Kullanıcının kontrolündedir; tarayıcı site verilerinin temizlenmesiyle kaldırılır |

**Anonimleştirme tercihi:** Bir rezervasyon kaydının istatistik veya mali kayıt olarak tutulması gerekiyorsa, kayıt silinmek yerine kişiyle ilişkilendirilebilir alanları (ad, telefon, kullanıcı kimliği) geri döndürülemez biçimde kaldırılır. Böylece işletme kendi doluluk geçmişini kaybetmez, veri ise kişisel olmaktan çıkar.

## 5. Periyodik imha

Saklama süresi dolan veriler için **altı ayda bir** (Haziran ve Aralık) periyodik imha yapılır. İmha işlemi kayıt altına alınır.

## 6. İlgili kişinin silme talebi

KVKK md. 11 ve md. 7 uyarınca silme talebi geldiğinde:

1. Talep en geç **otuz gün** içinde sonuçlandırılır.
2. Verinin işlenmesini gerektiren hukuki sebep hâlâ varsa (örneğin devam eden bir rezervasyon ya da zamanaşımı süresi dolmamış bir kayıt) talep gerekçesiyle birlikte reddedilir.
3. Sebep ortadan kalkmışsa veri silinir veya anonim hâle getirilir; aktarılmışsa üçüncü kişilere bildirilir.

> **Mevcut durum:** Uygulamada kendi kendine hesap silme akışı **bulunmamaktadır**; talepler elle karşılanmaktadır. Bu akışın uygulamaya eklenmesi planlanmıştır.

## 7. Sorumluluk

| Rol | Sorumluluk |
| --- | --- |
| [Ad Soyad / Unvan] | Politikanın yürütülmesi, periyodik imhanın yapılması |
| [Ad Soyad / Unvan] | İlgili kişi başvurularının karşılanması |

## 8. Güncelleme

Politika, mevzuat değişikliklerinde ve en az yılda bir gözden geçirilir.
