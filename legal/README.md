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
| `isletme-veri-sozlesmesi.md` | İşletmelerle imzalanacak veri koruma protokolü | İşletme sözleşmesinin eki |
| `veri-ihlali-mudahale-plani.md` | İhlal hâlinde ne yapılacağı, 72 saatlik bildirim | İç doküman |

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

## Metinler sitede nasıl yayımlanıyor

`aydinlatma`, `gizlilik`, `cerez-politikasi` ve `kvkk-basvuru` dosyaları uygulamada gerçek sayfa olarak sunulur (`/aydinlatma` vb.). Kaynak tek: sitedeki metin doğrudan bu markdown dosyalarından okunur, ikinci bir kopya tutulmaz.

Dosyanın başındaki **TASLAK** uyarısı durduğu sürece sayfa:

- üstte kırmızı "Bu metin taslaktır" bayrağı gösterir,
- `noindex` ile arama motorlarına kapalı kalır.

Hukukçu onayı geldiğinde markdown'ın başındaki uyarı bloğunu silmeniz yeterli — sayfa kendiliğinden yayın hâline geçer, kod değişikliği gerekmez.

## Şu an KVKK açısından yapılmayanlar

Metin yazmak uyum sağlamıyor; şunlar hâlâ eksik:

- **Hesap silme akışı yok.** md. 11 kapsamındaki silme talebi elle karşılanıyor.
- **Otomatik uyarı yok.** İşlem günlüğü var (`/isletme/gunluk`) ve kapsam tespiti artık mümkün, ama ihlali kendiliğinden fark edip haber veren bir mekanizma yok; günlük elle incelenir.
