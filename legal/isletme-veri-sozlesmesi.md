# İşletme Kişisel Veri Koruma Sözleşmesi (Ek Protokol)

> **TASLAK — hukukçu onayı alınmadan imzalatılmamalıdır.**
> Son güncelleme: [tarih]

Bu protokol, **[Şirket Unvanı]** ("RASTLA") ile aşağıda bilgileri yer alan işletme ("İŞLETME") arasında imzalanan [Hizmet/İş Ortaklığı Sözleşmesi]'nin ayrılmaz ekidir.

---

## ⚠ Hukukçu için birinci soru: taraf sıfatı

Bu metin, İŞLETME'nin **ayrı veri sorumlusu** olduğu varsayımıyla yazılmıştır. Gerekçe: hizmeti fiilen İŞLETME veriyor, misafirle kurulan asıl ilişki İŞLETME ile ve İŞLETME veriyi kendi müşteri kayıtları ile yasal yükümlülükleri için de kullanacak. Bu durumda RASTLA'dan İŞLETME'ye yapılan işlem, KVKK md. 8 kapsamında bir **aktarım**dır.

Alternatif değerlendirme: İŞLETME yalnızca RASTLA'nın talimatıyla ve RASTLA adına veri işliyorsa **veri işleyen** sayılır; bu durumda metin, md. 12/2 uyarınca veri işleyen sözleşmesine dönüştürülmelidir (talimatla bağlılık, alt işleyen yasağı, denetim hakkı gibi maddeler öne çıkar).

**Bu sınıflandırma avukat tarafından karara bağlanmalı, metin ona göre düzeltilmelidir.** Aşağıdaki yükümlülüklerin çoğu her iki hâlde de geçerlidir.

---

## 1. Taraflar

| | RASTLA | İŞLETME |
| --- | --- | --- |
| Unvan | [Şirket Unvanı] | […] |
| Adres | [Adres] | […] |
| Vergi dairesi / no | […] | […] |
| Yetkili | […] | […] |
| E-posta | [kvkk@ornek.com] | […] |
| Deniz Turizmi Araçları Turizm İşletmesi Belgesi no | — | […] |
| Belge vize tarihi | — | […] |

## 2. Konu ve kapsam

RASTLA, platformu üzerinden alınan rezervasyonlara ilişkin misafir verilerini, hizmetin verilebilmesi amacıyla İŞLETME'ye aktarır. Bu protokol, aktarılan verilerin korunmasına ilişkin tarafların yükümlülüklerini düzenler.

## 3. Aktarılan kişisel veriler

| Veri | Aktarım amacı |
| --- | --- |
| Misafirin adı ve soyadı | Hizmetin verilmesi, biletin doğrulanması |
| Cep telefonu numarası | Rezervasyon hakkında iletişim, aksilik hâlinde ulaşma |
| Rezervasyon detayları (aktivite, tarih, saat, katılımcı sayısı, tutar) | Hizmetin planlanması ve verilmesi |
| Bilet kodu ve durumu | Biletin doğrulanması, tek kullanımın sağlanması |

RASTLA, İŞLETME'ye bunların dışında kişisel veri aktarmaz. Misafirin kimlik numarası, adresi, doğum tarihi veya sağlık verisi aktarılmaz.

**Kart verisi hiçbir tarafa aktarılmaz.** Kart bilgisi ödeme kuruluşunun kendi sayfasında alınır; ne RASTLA'nın ne de İŞLETME'nin sunucularına ulaşır. İŞLETME yalnızca ödemenin **alınıp alınmadığını** ve tutarı görür.

**Erişim sınırı:** İŞLETME, platform üzerinde yalnızca **kendi aktivitelerine** ait rezervasyonları görebilir. Diğer işletmelerin misafirlerine teknik olarak erişimi yoktur.

## 3.A İŞLETME'ye ait ticari veriler

Pazaryeri modeliyle birlikte RASTLA, İŞLETME'ye ait aşağıdaki verileri de işlemeye başlamıştır. Bunlar misafir verisi değildir; **İŞLETME'nin kendi verisidir** ve burada ayrıca sayılması, veri envanterinin eksik kalmaması içindir.

| Veri | İşlenme amacı | Kime aktarılır |
| --- | --- | --- |
| Vergi numarası / T.C. kimlik numarası | Alt üye işyeri başvurusu | Ödeme kuruluşu |
| Vergi dairesi, unvan, açık adres | Aynı | Ödeme kuruluşu |
| IBAN | Hakedişin aktarılması | Ödeme kuruluşu |
| Yetkili kişinin adı, e-postası, telefonu | Başvuru ve iletişim | Ödeme kuruluşu |
| Komisyon oranı ve hakediş kayıtları | Mutabakat, muhasebe | Aktarılmaz |

Gerçek kişi ya da şahıs şirketi İŞLETME'lerde **T.C. kimlik numarası kişisel veridir** ve bu protokolün koruma yükümlülüklerine tabidir.

RASTLA bu verileri yalnızca ödeme kuruluşuna iletmek ve hakedişi aktarmak için işler; **başka hiçbir amaçla kullanmaz ve üçüncü kişilerle paylaşmaz.** Bilgiler İŞLETME tarafından `/isletme/odeme-ayarlari` ekranında, aktarımı açıkça onaylayarak girilir.

## 3.B Görsel içerik

İŞLETME, aktivite fotoğraflarını platforma kendisi yükler.

**İŞLETME şunları taahhüt eder:**

- Yüklediği görsellerin **kullanım hakkına sahip olduğunu** (kendi çektiği ya da hakkını devraldığı)
- Görsellerde **tanınabilir kişi varsa** o kişilerin açık rızasını aldığını
- Görsellerin aktiviteyi **doğru temsil ettiğini** — yanıltıcı görsel tüketici mevzuatı bakımından İŞLETME'nin sorumluluğundadır

**RASTLA'nın yaptığı ve yapmadığı:**

- Yüklenen her görsel sunucuda yeniden kodlanır ve **konum dahil tüm EXIF üstverisi silinir.** Bu, İŞLETME'nin çekim konumunun ve cihaz bilgisinin istemeden yayımlanmasını önler.
- Dosya türü, boyutu ve çözünürlüğü teknik olarak doğrulanır.
- **İçerik denetimi yapılmaz.** RASTLA görselin uygunluğunu önceden incelemez; bildirim üzerine kaldırır.

Üçüncü kişi hak sahibinden gelen talepler nedeniyle RASTLA'nın uğrayacağı zararlardan İŞLETME sorumludur.

## 4. İŞLETME'nin yükümlülükleri

### 4.1 Amaçla sınırlılık

İŞLETME, aktarılan verileri **yalnızca** rezervasyona konu hizmetin verilmesi, bu hizmete ilişkin iletişim ve kendi yasal yükümlülüklerinin yerine getirilmesi amacıyla işler.

Aşağıdakiler **açıkça yasaktır**:

- Misafire, ayrıca ve usulüne uygun açık rızası olmaksızın **pazarlama iletisi göndermek** (SMS, arama, e-posta dâhil)
- Verileri üçüncü kişilere satmak, kiralamak veya devretmek
- Verileri, RASTLA dışındaki kanallara müşteri yönlendirmek amacıyla kullanmak
- Verileri bu protokolde belirtilmeyen amaçlarla işlemek

> **[Hukukçu notu:** Son madde ticari açıdan kritik. Misafirin bir sonraki rezervasyonu doğrudan İŞLETME'ye yapması pazaryeri modelinin sürdürülebilirliğini etkiler. Bu maddenin rekabet hukuku açısından geçerliliği ve yaptırımı değerlendirilmelidir.]

### 4.2 Güvenlik

İŞLETME, aktarılan verilerin hukuka aykırı işlenmesini ve erişilmesini önlemek, muhafazasını sağlamak üzere gerekli teknik ve idari tedbirleri alır. Asgari olarak:

- Platform erişim bilgilerini (kişiye özel hesap parolası) hiç kimseyle paylaşmaz; her çalışan kendi hesabını kullanır, paylaşıldığından şüphelenilmesi hâlinde derhal RASTLA'ya bildirir ve hesabı askıya alır
- Misafir listesini içeren ekran görüntüsü, çıktı veya kopyayı hizmet dışı amaçlarla saklamaz
- Verilere erişen personelini gizlilik konusunda bilgilendirir ve bu kişileri gizlilikle yükümlü kılar
- Personel ayrıldığında erişimini derhal sonlandırır

### 4.3 Saklama ve imha

İŞLETME, aktarılan verileri hizmetin verilmesi ve yasal saklama yükümlülükleri için gereken süreyi aşan biçimde saklamaz. Bu protokol sona erdiğinde, saklamayı zorunlu kılan bir hukuki sebep yoksa verileri **otuz gün içinde** siler, yok eder veya anonim hâle getirir ve bunu RASTLA'ya yazılı olarak bildirir.

### 4.4 Veri ihlali bildirimi

İŞLETME, aktarılan verilere ilişkin bir ihlalden (yetkisiz erişim, kayıp, ifşa) haberdar olduğunda **gecikmeksizin ve en geç 24 saat içinde** RASTLA'ya bildirir.

Bu süre bilinçli olarak kısa tutulmuştur: RASTLA'nın Kişisel Verileri Koruma Kurulu'na bildirim yükümlülüğü **72 saat** ile sınırlıdır ve bu sürenin işlemeye başlaması için RASTLA'nın haberdar olması gerekir.

Bildirim şunları içerir: ihlalin niteliği, etkilenen kişi ve kayıt sayısı, olası sonuçları, alınan önlemler ve iletişim kurulacak kişi.

### 4.5 İlgili kişi talepleri

Misafir, İŞLETME'ye doğrudan bir KVKK talebiyle başvurursa, İŞLETME talebi **gecikmeksizin** RASTLA'ya iletir ve talebin karşılanması için gereken bilgi ve desteği sağlar. RASTLA'nın düzeltme veya silme bildirimlerini İŞLETME kendi kayıtlarına da uygular.

### 4.6 Denetim

RASTLA, makul bildirimle ve mesai saatleri içinde, İŞLETME'nin bu protokole uygunluğunu denetleyebilir ya da bilgi ve belge talep edebilir.

## 5. RASTLA'nın yükümlülükleri

- Misafirleri, verilerinin İŞLETME'ye aktarılacağı konusunda Aydınlatma Metni ile bilgilendirir
- İŞLETME'ye yalnızca hizmetin verilmesi için gerekli asgari veriyi aktarır
- Platform tarafındaki erişim yetkilendirmesini sağlar ve İŞLETME'nin yalnızca kendi rezervasyonlarını görmesini temin eder
- İŞLETME'nin bildirdiği ihlalleri değerlendirir ve gerekiyorsa Kurul'a bildirir

## 6. Yurt dışına aktarım

İŞLETME, aktarılan verileri RASTLA'nın yazılı onayı olmaksızın yurt dışına aktarmaz veya yurt dışında yerleşik bir hizmet sağlayıcıda saklamaz.

## 7. Alt yükleniciler

İŞLETME, aktarılan verileri kendi alt yüklenicilerine (ör. muhasebe, çağrı merkezi) yalnızca zorunlu hâllerde ve bu protokoldeki yükümlülüklere eşdeğer bir gizlilik taahhüdü almak kaydıyla aktarabilir. Aktarım öncesinde RASTLA'ya bildirir.

## 8. Süre ve sona erme

Bu protokol, taraflar arasındaki [Hizmet/İş Ortaklığı Sözleşmesi] yürürlükte kaldığı sürece geçerlidir. Ana sözleşmenin sona ermesi hâlinde, madde 4.3'teki imha yükümlülüğü ve gizlilik yükümlülüğü sona ermeden sonra da devam eder.

RASTLA, bu protokole aykırılık hâlinde İŞLETME'nin platform erişimini **derhal** askıya alabilir.

## 9. Sorumluluk

Taraflardan her biri, kendi kusurundan kaynaklanan KVKK ihlalleri nedeniyle doğacak idari para cezaları ve üçüncü kişi taleplerinden kendisi sorumludur.

İŞLETME, bu protokole aykırı davranışı nedeniyle RASTLA'nın uğrayacağı doğrudan zararları tazmin eder.

> **[Hukukçu notu:** Sorumluluk sınırı, ceza şartı ve rücu düzenlemesi ticari müzakereye bağlı olarak netleştirilmelidir.]

## 10. Uygulanacak hukuk ve yetki

Bu protokole Türk hukuku uygulanır. Uyuşmazlıklarda [İstanbul (Çağlayan)] Mahkemeleri ve İcra Daireleri yetkilidir.

---

## İmzalar

| RASTLA | İŞLETME |
| --- | --- |
| Ad Soyad: | Ad Soyad: |
| Unvan: | Unvan: |
| Tarih: | Tarih: |
| İmza: | İmza: |
