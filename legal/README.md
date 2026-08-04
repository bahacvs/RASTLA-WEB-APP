# Hukuki metinler — TASLAK

Bu klasördeki metinler **taslaktır ve hukukçu onayı olmadan yayımlanmamalıdır.**

Değerleri şurada: hazır şablon değiller. Her biri uygulamanın gerçekte ne işlediğine dayanıyor — veri envanteri `lib/db/schema.sql`, çerezler `lib/session.ts`, üçüncü taraflar `lib/map.ts` okunarak çıkarıldı. Yani avukatınız "siz gerçekte ne topluyorsunuz" sorusuna kod düzeyinde doğrulanmış bir cevapla başlayacak.

## Dosyalar

| Dosya | Ne işe yarar | Nerede yayımlanır |
| --- | --- | --- |
| `aydinlatma-metni.md` | KVKK md. 10 aydınlatma yükümlülüğü — asıl metin | Rezervasyon formunda bağlantı + `/aydinlatma` |
| `gizlilik-politikasi.md` | Genel gizlilik politikası | `/gizlilik`, mağaza başvuruları |
| `cerez-politikasi.md` | Çerez kullanımı | `/cerez-politikasi` |
| `acik-riza-metni.md` | Yalnızca açık rıza gereken dar kapsam | Pazarlama izni kutucuğu |
| `kvkk-basvuru-formu.md` | İlgili kişi başvuru formu | `/kvkk-basvuru` |
| `veri-saklama-imha-politikasi.md` | Saklama süreleri ve imha | İç doküman |

## Doldurulması gereken alanlar

Metinlerde `[…]` biçiminde işaretli yerler var: şirket unvanı, adres, MERSİS no, e-posta, KEP adresi. Şirket kuruluşu tamamlanmadan bunlar doldurulamaz.

## Avukata sorulacaklar

Bunlar benim karar veremeyeceğim, hukukçu görüşü gereken noktalar:

1. **Hukuki sebep seçimi.** Rezervasyon için açık rıza değil, **sözleşmenin kurulması ve ifası** (md. 5/2-c) dayanağını kullandım. Türkiye'de birçok site burada yanlışlıkla açık rıza istiyor; ad ve telefon rezervasyonun ifası için zorunlu olduğundan rıza dayanağı bence hatalı olurdu. Teyit edilmeli.
2. **Yurt dışına aktarım.** Vercel (barındırma) ve MapTiler (harita karoları) yurt dışında. 7499 sayılı Kanun'la değişen md. 9 uyarınca standart sözleşme gerekiyor ve imzadan sonra **5 iş günü içinde** Kurum'a sunulmalı. Hangi mekanizmanın (standart sözleşme / taahhütname) uygun olduğu ve kimin imzalayacağı netleşmeli.
3. **Saklama süreleri.** Rezervasyon kayıtları için 10 yıllık genel zamanaşımını esas aldım; vergi/ticari defter yükümlülükleriyle kesişimi kontrol edilmeli.
4. **İşletmelere aktarım.** Misafir adı ve telefonu, hizmeti verecek işletmeyle paylaşılıyor. Bunun md. 8 kapsamında sözleşmenin ifası için zorunlu aktarım sayıldığı varsayımıyla yazdım.
5. **Çocuk verisi.** Rezervasyonda "çocuk sayısı" tutuluyor ama çocuğun kimlik bilgisi tutulmuyor. Bu hâliyle çocuğa ait kişisel veri işlenmediği kanaatindeyim; teyit gerekli.
6. **VERBİS.** Mevcut ölçekte muafiyet kapsamındasınız (50'den az çalışan, 100 milyon TL altı bilanço). Büyüme hâlinde yeniden değerlendirilmeli.

## Şu an KVKK açısından yapılmayanlar

Dürüst olmak gerekirse metin yazmak yetmiyor; şunlar da yapılmalı:

- **Uygulamada aydınlatma bağlantısı yok.** Rezervasyon formuna eklenmeli.
- **Hesap silme akışı yok.** md. 11 kapsamındaki silme talebi şu an elle karşılanır.
- **Veri ihlali müdahale planı yok.** İhlal hâlinde Kurum'a 72 saat içinde bildirim yükümlülüğü var.
- **İşletmelerle veri işleme sözleşmesi yok.** İşletmeler misafir verisine erişiyor.
