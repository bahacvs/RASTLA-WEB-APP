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
| Ticari elektronik ileti izni / ret kaydı | Mevzuatın öngördüğü süre | İznin alınması / reddi | 6563 sayılı Kanun |

> **[Hukukçu notu:** 10 yıllık süre TBK md. 146 genel zamanaşımı esas alınarak önerilmiştir. Vergi Usul Kanunu ve TTK'daki defter/belge saklama yükümlülükleriyle kesişimi ve ödeme altyapısı devreye girdiğinde değişip değişmeyeceği değerlendirilmelidir.]

## 4. İmha yöntemleri

| Ortam | Yöntem |
| --- | --- |
| Veritabanı kayıtları | Kaydın silinmesi; muhasebe/uyuşmazlık gereği tutulması gerekiyorsa kimlik ve iletişim alanlarının anonimleştirilmesi |
| Sunucu günlükleri | Otomatik yaşlandırma ile silme |
| İşlem günlüğü | Yaşlandırma ile toplu silme (`purgeAuditOlderThan`) |
| Yedekler | Yedek döngüsü tamamlandığında üzerine yazma |
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
