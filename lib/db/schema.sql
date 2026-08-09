-- RASTLA rezervasyon şeması.
--
-- Pilot dönemde SQLite kullanılıyor. Üretimde Postgres'e geçilecek; şema
-- bilinçli olarak her iki motorda da çalışacak sadelikte tutuldu.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL,

  -- Hesap silindiğinde doldurulur. Satır SİLİNMEZ, anonimleştirilir: rezervasyon
  -- kayıtları 10 yıllık zamanaşımı boyunca saklanmak zorunda ve bookings.user_id
  -- bu satıra bağlı. Ad ve telefon yerine geri döndürülemez yer tutucular yazılır;
  -- kalan satır artık hiçbir kişiye işaret etmez.
  -- (Sonradan eklendi — mevcut kurulumlar için bkz. lib/db/index.ts migrate().)
  deleted_at  TEXT
);

-- Otel, tur şirketi, konsiyerj — RASTLA'ya misafir yönlendiren aracılar.
--
-- Otellerin çoğunda teknik ekip yok; makine API'si bu turun kapsamı dışında.
-- Onun yerine bir portal: resepsiyon görevlisi giriyor, müsaitliği görüyor,
-- misafir adına yer tutuyor.
--
-- **Acente rezervasyonu KOMİSYON DOĞURMUYOR** (bu turun ticari kararı) ama
-- kapasiteyi normal bir rezervasyon gibi tüketiyor. Sebep komisyon değil,
-- MÜSAİTLİĞİN DOĞRU OLMASI: otelden alınan yer sisteme girmezse RASTLA
-- müşterisine boş görünen saat aslında doludur ve iki grup aynı anda
-- iskeleye gelir. `source='agency'` bugünden kaydediliyor, böylece ticari
-- model netleştiğinde geçmiş veri kaybolmuş olmuyor.
CREATE TABLE IF NOT EXISTS agencies (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  contact_email TEXT,
  phone         TEXT,

  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended')),

  created_at    TEXT NOT NULL
);

-- Acente personelinin hesabı. `platform_users` deseninin birebir eşi.
--
-- Aynı e-posta hem işletme, hem platform, hem acente hesabı olabilir; üçü ayrı
-- oturum çerezi taşır ve hiçbiri diğerinin yetkisini vermez.
CREATE TABLE IF NOT EXISTS agency_users (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  email          TEXT NOT NULL UNIQUE,   -- küçük harfe indirgenmiş
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,

  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'suspended')),

  created_at     TEXT NOT NULL,
  last_login_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_agency_users_agency ON agency_users(agency_id, status);

-- Hizmeti veren işletme. Önceden lib/operators.ts içinde sabit bir diziydi.
CREATE TABLE IF NOT EXISTS operators (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL,

  -- ---- Pazaryeri ödeme bilgileri (sonradan eklendi) ----
  --
  -- RASTLA tutarın tamamını tahsil edip komisyonunu keserek kalanı işletmeye
  -- aktarıyor. Bunun için işletmenin sağlayıcıda "alt üye işyeri" olarak
  -- tanımlı olması gerekiyor; anahtarı olmayan işletme online ödemeye
  -- açılamaz — para, aktarılamayacak bir yere toplanmamalı.
  submerchant_key TEXT,
  legal_type      TEXT,   -- 'personal' | 'private' | 'limited'
  legal_name      TEXT,   -- vergi levhasındaki unvan
  tax_number      TEXT,
  tax_office      TEXT,
  identity_number TEXT,   -- şahıs şirketi/gerçek kişi için TCKN
  iban            TEXT,
  legal_address   TEXT,
  contact_email   TEXT,

  -- RASTLA'nın payı, on binde. 1800 = %18. Tam sayı tutuluyor ki kuruş
  -- hesabında kayan nokta yuvarlaması olmasın.
  --
  -- DİKKAT — bu sayı yalnızca kod değil, SÖZLEŞME meselesi. Varsayılanı
  -- değiştirmek yeni işletmeleri etkiler; var olan bir işletmenin oranını
  -- değiştirmek, o işletmeyle imzalanmış ticari sözleşmenin de güncellenmesini
  -- gerektirir. İşletme başına oran Faz F'te panelden belirlenecek.
  commission_bp   INTEGER NOT NULL DEFAULT 1800
                  CHECK (commission_bp >= 0 AND commission_bp <= 10000),

  -- ---- RASTLA doğrulaması ----
  --
  -- Müşteri tarafındaki "doğrulanmış işletme" rozeti buna bağlı. Önce rozet
  -- HERKESE gösteriliyordu ve bu, doğrulanmamış bir işletme için müşteriye
  -- söylenmiş yanlış bir cümleydi: rozet bir şey iddia ediyorsa arkasında bir
  -- kontrol olmak zorunda.
  --
  -- basvuru          -> kaydoldu, henüz belge vermedi
  -- belge_bekleniyor -> istenen belgeler eksik
  -- inceleniyor      -> belgeler geldi, RASTLA bakıyor
  -- dogrulandi       -> onaylandı; rozet ancak bu durumda gösterilir
  -- durduruldu       -> geçici olarak askıda (uyuşmazlık, şikâyet)
  -- kapatildi        -> ilişki sonlandı
  verification_status TEXT NOT NULL DEFAULT 'basvuru'
                  CHECK (verification_status IN ('basvuru', 'belge_bekleniyor',
                         'inceleniyor', 'dogrulandi', 'durduruldu', 'kapatildi')),
  -- RASTLA'nın iç notu. Müşteriye ve işletmeye GÖSTERİLMEZ.
  verification_note TEXT,
  verified_at     TEXT,

  -- Hak ediş durdurma. Uyuşmazlık ya da şikâyet hâlinde para sağlayıcıda
  -- bloke kalmaya devam eder; rezervasyon ve check-in çalışmayı sürdürür.
  -- İkisi ayrı tutuluyor çünkü işletmeyi tamamen kapatmak müşterinin elindeki
  -- geçerli bileti de geçersiz kılardı.
  payouts_suspended INTEGER NOT NULL DEFAULT 0
                  CHECK (payouts_suspended IN (0, 1))
);

-- İşletme personelinin kişisel hesabı.
--
-- Paylaşılan erişim kodunun yerini alır. Sebebi denetimdir: bilet onayı,
-- iptal ve aktivite değişikliği geri dönüşü olmayan işlemlerdir; bir ihlalde
-- "kim yaptı" sorusunun cevabı olması gerekir. Paylaşılan kodla bu soru
-- yapısal olarak cevapsızdı.
CREATE TABLE IF NOT EXISTS operator_users (
  id             TEXT PRIMARY KEY,
  operator_id    TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,

  email          TEXT NOT NULL UNIQUE,   -- küçük harfe indirgenmiş
  name           TEXT NOT NULL,

  -- İkinci faktörün gideceği numara. Sonradan eklendi, bu yüzden NULL olabilir:
  -- eski hesaplar parolayla girmeye devam eder ve ekip ekranında "ikinci
  -- faktör yok" uyarısı alır. Yeni hesaplarda zorunlu.
  phone          TEXT,

  -- scrypt$N$r$p$salt$hash — parametreler kaydın içinde taşınır, böylece
  -- maliyet ilerideki donanıma göre artırıldığında eski kayıtlar da
  -- doğrulanmaya devam eder.
  password_hash  TEXT NOT NULL,

  -- owner   : her şey — finans, hak ediş, banka bilgisi, ekip yönetimi
  -- manager : operasyon — takvim, aktivite, rezervasyon, manuel kayıt.
  --           Finansa ve banka bilgisine erişemez; rezervasyonu oluşturan ile
  --           parayı yönlendiren aynı kişi olmasın diye (görev ayrılığı).
  -- staff   : saha — yalnızca bugünü görür ve bilet okutur. Müşteri listesini
  --           toplu indiremez; ayrılan çalışanın elinde kalmamalı.
  --
  -- Yetenek eşlemesi lib/permissions.ts içinde, tek kaynak olarak duruyor.
  role           TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),

  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'suspended')),

  created_at     TEXT NOT NULL,
  last_login_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_operator_users_operator ON operator_users(operator_id, status);

-- Bir hesabın EK işletmelere erişimi.
--
-- `operator_users.operator_id` kişinin ANA işletmesini taşımaya devam ediyor
-- ve kimliğin (e-posta + parola) sahibi orası. Bu tablo yalnızca ek erişim
-- veriyor. Ana işletmeyi buraya taşımak, var olan her sorguyu değiştirmek
-- demekti; erişimi genişletmenin bedeli mevcut davranışın bozulması olmamalı.
--
-- ROL İŞLETME BAŞINA. Kendi işletmesinde sahip olan biri, ortağının
-- işletmesinde yalnızca saha personeli olabilir — yetki devri tek yönlü
-- olmak zorunda değil ve tek bir rol sütunu bunu ifade edemezdi.
--
-- Erişim her istekte BURADAN doğrulanıyor; seçili işletme çerezde taşınsa da
-- çerez yalnızca "hangisi" diyor, "girebilir mi" demiyor. Üyelik silindiği
-- anda elindeki çerez işe yaramaz hâle gelir — askıya alınan hesabın
-- oturumunun anında düşmesiyle aynı güvence (bkz. lib/auth.ts).
CREATE TABLE IF NOT EXISTS operator_memberships (
  id               TEXT PRIMARY KEY,
  operator_user_id TEXT NOT NULL REFERENCES operator_users(id) ON DELETE CASCADE,
  operator_id      TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,

  role             TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),

  created_at       TEXT NOT NULL,
  -- Üyeliği kim verdi. Uyuşmazlıkta sorulan ilk soru bu.
  granted_by       TEXT,

  UNIQUE (operator_user_id, operator_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON operator_memberships(operator_user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_operator ON operator_memberships(operator_id);

-- İşletmenin lokasyonu.
--
-- Aynı tüzel kişiliğin iki koyu, iki iskelesi olabiliyor ve "bugün ne var"
-- sorusunun cevabı lokasyona göre değişiyor: Büyükçekmece'deki personelin
-- Silivri'nin rezervasyonlarını görmesi işe yaramıyor.
--
-- HAK EDİŞ VE IBAN ŞUBE DÜZEYİNE İNMİYOR. Şube kırılımı raporlama içindir;
-- ayrı IBAN gereken bir şube aslında ayrı bir işletmedir ve üyelikle
-- erişilmelidir. Parayı ikiye bölmek, hak ediş defterinin dayandığı
-- "bir rezervasyon = bir işletme" varsayımını kırardı.
CREATE TABLE IF NOT EXISTS branches (
  id          TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,

  name        TEXT NOT NULL,
  address     TEXT,
  lat         REAL,
  lng         REAL,

  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_branches_operator ON branches(operator_id);

-- RASTLA operasyon ekibi.
--
-- Ayrı tablo, çünkü bu kişiler bir işletmeye bağlı değil. `operator_users`
-- içine sıkıştırmak `operator_id`'yi anlamsızlaştırırdı: ya uydurma bir
-- işletmeye bağlanacaklardı ya da sütun NULL olacak ve o andan itibaren
-- "hangi işletmenin personeli" sorusunun cevabı belirsizleşecekti. Yetki
-- alanları da bambaşka — işletme doğrulama, ilan onayı, hak ediş durdurma.
--
-- Aynı e-posta hem işletme hem platform hesabı olabilir; ikisi ayrı oturum
-- çerezi taşır ve biri diğerinin yetkisini vermez.
CREATE TABLE IF NOT EXISTS platform_users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,   -- küçük harfe indirgenmiş
  name           TEXT NOT NULL,
  phone          TEXT,
  password_hash  TEXT NOT NULL,

  -- admin    : her şey, platform hesabı açabilir
  -- reviewer : işletme doğrulama ve ilan onayı; komisyona ve hak edişe dokunamaz
  role           TEXT NOT NULL CHECK (role IN ('admin', 'reviewer')),

  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'suspended')),

  created_at     TEXT NOT NULL,
  last_login_at  TEXT
);

-- İşletmenin yönettiği aktiviteler. Önceden lib/data.ts içinde sabitti.
CREATE TABLE IF NOT EXISTS activities (
  id                TEXT PRIMARY KEY,
  operator_id       TEXT NOT NULL REFERENCES operators(id),
  slug              TEXT NOT NULL UNIQUE,

  title             TEXT NOT NULL,
  category          TEXT NOT NULL,
  description       TEXT,
  price_try         INTEGER NOT NULL CHECK (price_try >= 0),
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0),

  location_name     TEXT NOT NULL,
  lat               REAL,
  lng               REAL,

  -- Hangi şubede yapılıyor. NULL olabilir ve olmalı: şube tanımlamamış
  -- işletmelerin mevcut ilanları hiçbir şey yapmadan çalışmaya devam etsin.
  -- Şube silinirse ilan kalır, yalnızca şubesiz olur — ilanı silmek,
  -- rezervasyonlarını da götürürdü.
  branch_id         TEXT REFERENCES branches(id) ON DELETE SET NULL,

  -- Kapasitenin neyi saydığı aktiviteye göre değişir; hangi araca kaç kişi
  -- güvenli sığar, bunu işletme bilir.
  --   per_person  -> katılımcı sayısı kadar yer düşer (grup turu, SUP)
  --   per_booking -> rezervasyon başına 1 yer düşer (kişiye bir jet ski)
  capacity_mode     TEXT NOT NULL DEFAULT 'per_person'
                    CHECK (capacity_mode IN ('per_person', 'per_booking')),

  -- Seans açılması için gereken en az katılımcı. Altında kalırsa işletme
  -- iptal edip tam iade verebilir; müşteriye baştan söylenmiş olur.
  min_participants  INTEGER NOT NULL DEFAULT 1 CHECK (min_participants > 0),

  -- Seans başlangıcına şu kadar dakika kala rezervasyon kapanır. 0 = sınır
  -- yok. Ekipmanın hazırlanması ve müşterinin yola çıkması için gereken pay.
  booking_cutoff_minutes INTEGER NOT NULL DEFAULT 0 CHECK (booking_cutoff_minutes >= 0),

  -- İki seans arasındaki hazırlık payı. Seans aralığına EKLENİR: 15 dakikalık
  -- jet ski turu + 5 dakika hazırlık = 20 dakikada bir kalkış.
  prep_minutes      INTEGER NOT NULL DEFAULT 0 CHECK (prep_minutes >= 0),

  -- Kapora yüzdesi. NULL = kapora yok (varsayılan davranış değişmiyor).
  --
  -- İşletmenin asıl derdi gelmeyen müşteri: tesiste ödemeli rezervasyonda
  -- "gelmedim" bedava, insanlar üç yere birden yazılıyor ve işletme dolu
  -- sandığı saati boş geçiriyor. Tamamını peşin istemek dönüşü düşürüyor;
  -- kapora ikisinin arasında.
  --
  -- Üst sınır 100 değil 80: tamamı istenecekse `payment_mode='online'` zaten
  -- var ve "%100 kapora" iki farklı adı olan tek bir şey demek olurdu.
  deposit_percent   INTEGER CHECK (deposit_percent IS NULL
                                   OR (deposit_percent BETWEEN 5 AND 80)),

  -- ---- Hava eşikleri ----
  --
  -- Hepsi NULL olabilir ve NULL **kontrol yok** demektir. Varsayılan olarak
  -- bir sınır koymak, hiç düşünmemiş bir işletmenin gününü uydurma bir eşik
  -- yüzünden riskli göstermek olurdu. Sihirbaz kategoriye göre değer ÖNERİR;
  -- karar işletmenin.
  --
  -- Eşik aşıldığında hiçbir şey otomatik iptal EDİLMEZ: gün "riskli" ya da
  -- "elverişsiz" işaretlenir ve iptal düğmesi işletmenin önüne konur. Yanlış
  -- bir tahminin bedeli bir uyarı olmalı, iptal edilmiş bir gün değil.
  wind_limit_kmh    REAL CHECK (wind_limit_kmh IS NULL OR wind_limit_kmh > 0),
  gust_limit_kmh    REAL CHECK (gust_limit_kmh IS NULL OR gust_limit_kmh > 0),
  wave_limit_m      REAL CHECK (wave_limit_m IS NULL OR wave_limit_m > 0),

  image             TEXT,
  image_alt         TEXT,

  -- Liste hâlindeki alanlar JSON metni olarak tutulur. Pilot için yeterli ve
  -- her iki veritabanı motorunda da çalışır; ayrı tablolara bölmek bu aşamada
  -- karmaşıklıktan başka bir şey getirmezdi.
  included          TEXT,   -- JSON: string[]
  safety            TEXT,   -- JSON: string[]
  gallery           TEXT,   -- JSON: { src, alt }[]
  meeting_point     TEXT,   -- JSON: { image, alt }
  reviews           TEXT,   -- JSON: Review[]

  capacity_label    TEXT,
  instant_confirm   INTEGER NOT NULL DEFAULT 0,

  -- Değerlendirme özeti. Şimdilik veriden gelir; gerçek yorum tablosu
  -- devreye girdiğinde oradan hesaplanacak.
  rating            REAL NOT NULL DEFAULT 0,
  review_count      INTEGER NOT NULL DEFAULT 0,

  -- draft          -> işletme üzerinde çalışıyor, kimse görmüyor
  -- pending_review -> yayına verildi, RASTLA kontrolünde. MÜŞTERİYE GÖRÜNMEZ.
  -- published      -> yayında
  --
  -- İnceleme adımı yalnızca **doğrulanmamış** işletmelerin ilanları için
  -- işliyor (bkz. lib/db/activities.ts). Doğrulanmış bir işletmeyi her ilanda
  -- yeniden incelemek, kontrolün bir kez yapılan işletme doğrulaması olduğu
  -- gerçeğiyle çelişirdi; buna karşılık daha hiç doğrulanmamış bir işletmenin
  -- ilanının kontrolsüz yayına çıkması, rozetle verilen güvenceyi boşa
  -- çıkarırdı.
  --
  -- Kısıt ADLANDIRILDI: durum listesi genişledi ve göçte bulunabilmesi gerek.
  status            TEXT NOT NULL DEFAULT 'draft'
                    CONSTRAINT activities_status_check
                    CHECK (status IN ('draft', 'pending_review', 'published')),

  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_operator ON activities(operator_id);
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);

-- İşletmenin kendi kanalları için paylaşılabilir rezervasyon linki.
--
-- Ürünün asıl vaadi "bütün kanallarınız tek takvimde" ama işletmenin kendi
-- kanalından (Instagram bio, tabeladaki QR, WhatsApp yanıtı) gelen müşteriyi
-- sisteme sokacak bir yol yoktu: elle kayıt açmak gerekiyordu ve kimse her
-- telefon için panel açmıyor. Bu link o boşluğu kapatıyor.
--
-- KANAL BAŞINA AYRI LİNK açılabiliyor. "Hangi kanal işe yarıyor" sorusunun
-- cevabı ancak böyle çıkar; tek link olsaydı bütün kanallar tek bir sayıya
-- karışırdı.
--
-- `code` adres çubuğunda görünüyor ve TAHMİN EDİLEMEZ olmalı: tahmin
-- edilebilir olsaydı biri başka bir işletmenin linkini bulup rezervasyonlarını
-- kendi kanalına yazdırabilirdi. Bilet kodundaki alfabenin aynısı kullanılıyor
-- (I/L/O/U yok — telefonda söylerken karışmıyor).
CREATE TABLE IF NOT EXISTS booking_links (
  id           TEXT PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,

  activity_id  TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  operator_id  TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,

  -- İşletmenin kendi verdiği ad: "Instagram bio", "İskele tabelası".
  label        TEXT NOT NULL,

  -- Bu linkten gelen rezervasyonun kaynağı. bookings.source ile aynı liste.
  source       TEXT NOT NULL DEFAULT 'link'
               CHECK (source IN ('link', 'instagram', 'whatsapp', 'phone', 'hotel')),

  -- Bu linkten kaç rezervasyon geldi. Tıklama değil REZERVASYON sayılıyor:
  -- işletmenin sorduğu soru "kaç kişi baktı" değil, "kaç satış geldi".
  bookings     INTEGER NOT NULL DEFAULT 0,

  created_at   TEXT NOT NULL,
  -- Kapatılan link çalışmaz ama SİLİNMEZ: geçmiş rezervasyonların hangi
  -- kanaldan geldiği bilgisi silinmemeli.
  disabled_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_booking_links_activity ON booking_links(activity_id);

-- Fiyat kuralları: sezon, gün ve saat.
--
-- Tek fiyat su sporlarında gerçeği yansıtmıyor: temmuz ile eylül aynı değil,
-- hafta içi sabahla cumartesi öğleden sonra hiç değil. Kuralsız bir sistemde
-- işletme ya yüksek fiyattan boş kalıyor ya düşük fiyattan dolu günde para
-- bırakıyor.
--
-- SIRA AÇIK: `priority` büyük olan önce bakılır, eşitlikte önce oluşturulan.
-- "En özgül kural kazanır" gibi örtük bir kural daha akıllı görünürdü ama
-- işletme hangi fiyatın neden çıktığını göremezdi; güvenlik duvarı kuralları
-- gibi sıralı ve okunabilir olması bilinçli.
--
-- Hiçbir kural eşleşmezse `activities.price_try` geçerli — yani kural
-- eklemeyen işletme için hiçbir şey değişmiyor.
CREATE TABLE IF NOT EXISTS price_rules (
  id           TEXT PRIMARY KEY,
  activity_id  TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,

  label        TEXT NOT NULL,
  priority     INTEGER NOT NULL DEFAULT 0,

  -- Tarih aralığı; NULL = sınırsız. Sezon böyle tanımlanıyor.
  valid_from   TEXT,
  valid_until  TEXT,

  -- Haftanın günleri, 7 bitlik maske. Bit 0 = Pazartesi (schedule_rules ile
  -- AYNI düzen; iki farklı düzen olsaydı biri diğerine bakarak yazan kişi
  -- yanılırdı). 127 = her gün.
  weekdays     INTEGER NOT NULL DEFAULT 127 CHECK (weekdays BETWEEN 1 AND 127),

  -- Saat aralığı; NULL = tüm gün. start dahil, end hariç (schedule_rules ile
  -- aynı yorum).
  start_time   TEXT,
  end_time     TEXT,

  -- Kişi başı fiyat, TL. Tam sayı: kuruş yuvarlaması olmasın.
  price_try    INTEGER NOT NULL CHECK (price_try >= 0),

  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_rules_activity ON price_rules(activity_id);

-- Grup indirimi: kişi sayısına göre yüzde.
--
-- Ayrı tablo çünkü ayrı bir soru: fiyat kuralı "ne zaman" der, indirim "kaç
-- kişi" der. Tek tabloda birleştirilseydi her sezon kuralının her grup
-- büyüklüğü için tekrar yazılması gerekirdi.
--
-- Uygulanan indirim, kişi sayısının GEÇTİĞİ en yüksek eşik. İki eşik birden
-- uygulanmıyor; üst üste binen indirimler işletmenin hesaplayamayacağı bir
-- toplam üretirdi.
CREATE TABLE IF NOT EXISTS group_discounts (
  id           TEXT PRIMARY KEY,
  activity_id  TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,

  min_people   INTEGER NOT NULL CHECK (min_people >= 2),
  percent      INTEGER NOT NULL CHECK (percent > 0 AND percent <= 50),

  created_at   TEXT NOT NULL,

  -- Aynı eşik için iki indirim olamaz: hangisinin geçerli olduğu belirsiz
  -- kalırdı.
  UNIQUE (activity_id, min_people)
);

CREATE INDEX IF NOT EXISTS idx_group_discounts_activity ON group_discounts(activity_id);


-- Tekrarlayan müsaitlik tanımı: "08:00'dan 18:00'e, 15 dakikada bir, 4 kişi".
-- Slotların tek gerçek kaynağıdır; slotlar buradan üretilir.
CREATE TABLE IF NOT EXISTS schedule_rules (
  id                TEXT PRIMARY KEY,
  activity_id       TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,

  -- Haftanın günleri, 7 bitlik maske. Bit 0 = Pazartesi … bit 6 = Pazar.
  -- 127 = her gün.
  weekdays          INTEGER NOT NULL CHECK (weekdays BETWEEN 1 AND 127),

  start_time        TEXT NOT NULL,   -- HH:MM, dahil
  end_time          TEXT NOT NULL,   -- HH:MM, hariç
  interval_minutes  INTEGER NOT NULL CHECK (interval_minutes > 0),
  capacity          INTEGER NOT NULL CHECK (capacity > 0),

  valid_from        TEXT NOT NULL,   -- YYYY-MM-DD
  valid_until       TEXT,            -- NULL = süresiz
  active            INTEGER NOT NULL DEFAULT 1,

  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rules_activity ON schedule_rules(activity_id, active);

-- Kuraldan üretilmiş tekil zaman dilimi. Rezervasyon buraya bağlanır ve
-- kapasite burada tutulur.
-- Ekipman havuzu.
--
-- Bazı aktivitelerde kapasite kişi değil araçtır: 3 jet ski, 5 kano, 1 tekne,
-- 2 eğitmen. Kişi kapasitesiyle ekipman kapasitesi farklı şeyleri sayar ve
-- ikisi de bağımsız olarak dolabilir.
--
-- Şimdilik aktivite başına EN FAZLA BİR havuz kullanılıyor (en dar sınır
-- hangisiyse o). Birden çok kaynağı aynı anda kısıtlamak (hem tekne hem
-- eğitmen) çok daha karmaşık bir tahsis problemi ve pilot için gereksiz;
-- tablo yapısı ileride ikinci havuza izin verecek şekilde kuruldu ama motor
-- şu an ilkini kullanıyor.
CREATE TABLE IF NOT EXISTS equipment_pools (
  id                TEXT PRIMARY KEY,
  activity_id       TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,

  name              TEXT NOT NULL,           -- "Jet ski", "Kano", "Eğitmen"
  unit_count        INTEGER NOT NULL CHECK (unit_count > 0),
  capacity_per_unit INTEGER NOT NULL DEFAULT 1 CHECK (capacity_per_unit > 0),

  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_equipment_pools_activity ON equipment_pools(activity_id);

CREATE TABLE IF NOT EXISTS slots (
  id           TEXT PRIMARY KEY,
  activity_id  TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,

  -- Slotu üreten kural. Kural silinse de slot ve rezervasyonları kalır.
  rule_id      TEXT REFERENCES schedule_rules(id) ON DELETE SET NULL,

  slot_date    TEXT NOT NULL,   -- YYYY-MM-DD
  slot_time    TEXT NOT NULL,   -- HH:MM

  -- Kapasite üretim anında kuraldan KOPYALANIR. Kural sonradan değişirse
  -- mevcut rezervasyonların dayandığı kapasite geriye dönük bozulmasın.
  capacity     INTEGER NOT NULL CHECK (capacity > 0),
  booked       INTEGER NOT NULL DEFAULT 0,

  -- Ekipman sınırı. NULL ise bu aktivitede ekipman havuzu tanımlı değildir ve
  -- yalnızca kişi kapasitesi geçerlidir.
  --
  -- Kişi kapasitesi tek başına yetmiyor: jet skide asıl sınır araç sayısıdır.
  -- 3 araç × 2 kişi tanımlı bir seansta 6 kişilik yer vardır, ama 6 kişi tek
  -- başına gelirse (her biri ayrı araç isterse) 3'ünden fazlası alınamaz.
  -- İki sayaç ayrı tutuluyor çünkü ikisi farklı şeyleri sayıyor.
  unit_capacity INTEGER CHECK (unit_capacity IS NULL OR unit_capacity > 0),
  units_booked  INTEGER NOT NULL DEFAULT 0,

  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at   TEXT NOT NULL,

  -- Aşırı rezervasyona karşı şema tarafındaki güvence. Koşullu UPDATE zaten
  -- engeller; bu kısıt son savunma hattıdır.
  CHECK (booked >= 0 AND booked <= capacity),
  CHECK (units_booked >= 0 AND (unit_capacity IS NULL OR units_booked <= unit_capacity)),

  -- Aynı aktivite için aynı ana iki slot üretilemez; slot üretimini
  -- idempotent yapan şey budur.
  UNIQUE (activity_id, slot_date, slot_time)
);

CREATE INDEX IF NOT EXISTS idx_slots_lookup ON slots(activity_id, slot_date, slot_time);

CREATE TABLE IF NOT EXISTS bookings (
  id             TEXT PRIMARY KEY,

  -- Bilette ve QR'da görünen kod. Yüksek entropili ve rastgele; tahmin
  -- edilemediği için ayrıca imzalanmasına gerek yok.
  code           TEXT NOT NULL UNIQUE,

  user_id        TEXT NOT NULL REFERENCES users(id),
  activity_slug  TEXT NOT NULL,
  operator_id    TEXT NOT NULL,

  -- Rezervasyonun tutunduğu slot. Kapasite bu slottan düşülür.
  slot_id        TEXT REFERENCES slots(id),

  -- Slottan düşen miktar. Aktivitenin capacity_mode alanına göre hesaplanır:
  -- per_person -> katılımcı sayısı, per_booking -> 1. İptalde aynı miktar
  -- geri verilir, bu yüzden rezervasyonla birlikte saklanır.
  units          INTEGER NOT NULL DEFAULT 1 CHECK (units > 0),

  -- Slotun EKİPMAN sayacından düşen araç sayısı. Havuz yoksa 0.
  -- Rezervasyonla saklanıyor çünkü havuz sonradan değişebilir; iptalde
  -- yeniden hesaplamak, tutulandan farklı bir miktarı iade etme riski taşır.
  equipment_units INTEGER NOT NULL DEFAULT 0 CHECK (equipment_units >= 0),

  -- Rezervasyon nereden geldi.
  --
  -- İşletmenin bütün kanallarını sisteme almanın tek sebebi komisyon değil,
  -- MÜSAİTLİĞİN DOĞRU OLMASI: telefondan alınan bir rezervasyon sisteme
  -- girilmezse, RASTLA müşterisine boş görünen saat aslında doludur ve iki
  -- grup aynı saatte iskeleye gelir.
  source         TEXT NOT NULL DEFAULT 'rastla'
                 CHECK (source IN ('rastla', 'link', 'instagram', 'whatsapp',
                                   'phone', 'hotel', 'agency', 'manual')),

  -- online  -> RASTLA üzerinden tahsil edildi
  -- onsite  -> tesiste ödenecek/ödendi (manuel kayıtlar)
  -- deposit -> kapora alındı, kalanı tesiste
  payment_mode   TEXT NOT NULL DEFAULT 'online'
                 CHECK (payment_mode IN ('online', 'onsite', 'deposit')),

  -- Check-in'de kaç kişinin geldiği. NULL = henüz okutulmadı.
  -- Rezervasyondaki kişi sayısından farklı olabilir; uyuşmazlıkta kanıt olur.
  -- Hak ediş bu sayıya değil rezervasyon tutarına bağlıdır.
  attended       INTEGER CHECK (attended IS NULL OR attended >= 0),
  no_show_at     TEXT,

  -- Manuel kaydı açan işletme personeli. RASTLA'dan gelen rezervasyonlarda
  -- NULL. "Kim ekledi" sorusu uyuşmazlıkta soruluyor.
  created_by     TEXT,

  -- Rezervasyonu açan acente. NULL = acente yok.
  --
  -- `source='agency'` etiketiyle birlikte çalışıyor ama onun yerine geçmiyor:
  -- etiket "nereden geldi" der, bu sütun "hangi acenteden" der. Acente kendi
  -- rezervasyonlarını bu alanla listeliyor ve işletme "hangi otel gönderdi"
  -- sorusunu buradan görüyor.
  agency_id      TEXT,

  booking_date   TEXT NOT NULL,   -- YYYY-MM-DD
  booking_time   TEXT NOT NULL,   -- HH:MM
  adults         INTEGER NOT NULL,
  children       INTEGER NOT NULL,
  total_try      INTEGER NOT NULL,

  -- RASTLA üzerinden PEŞİN tahsil edilen tutar. Kalanı tesiste ödenir.
  --
  -- `payment_mode='deposit'` ile birlikte anlam kazanıyor; diğer kiplerde 0.
  -- Yüzde değil TUTAR saklanıyor: işletme kapora oranını sonradan
  -- değiştirebilir ve geçmiş bir rezervasyonun tahsil edilmiş kaporası o
  -- değişiklikle birlikte değişemez — komisyon ve iade bu tutara bağlı.
  deposit_try    INTEGER NOT NULL DEFAULT 0
                 CHECK (deposit_try >= 0 AND deposit_try <= total_try),

  -- pending_payment -> kapasite tutuldu, ödeme bekleniyor. BİLET GEÇERSİZ.
  -- confirmed       -> ödeme alındı, okutulmayı bekleyen geçerli bilet
  -- redeemed        -> işletme tarafından okutulup kullanıldı (geri dönüşü yok)
  -- cancelled       -> iptal edildi
  -- expired         -> ödeme süresi doldu, kapasite geri verildi
  --
  -- Tek kullanım güvencesi bedavaya geliyor: bilet onayı
  -- `WHERE code=? AND status='confirmed'` koşuluna dayandığı için ödemesi
  -- tamamlanmamış bir rezervasyon hiçbir ek kod yazılmadan okutulamaz.
  --
  -- Kısıt ADLANDIRILDI: durum listesi ileride yine değişebilir ve isimsiz bir
  -- kısıtı göçte bulup değiştirmek motora göre farklı yollar gerektirirdi.
  status         TEXT NOT NULL CONSTRAINT bookings_status_check
                 CHECK (status IN ('pending_payment', 'confirmed', 'redeemed', 'cancelled', 'expired')),

  created_at     TEXT NOT NULL,

  -- Mesafeli satış sözleşmesi ve ön bilgilendirme formunun onaylandığı an.
  --
  -- Mevzuat, tüketicinin bu metinleri sipariş ÖNCESİNDE onayladığının
  -- ispatlanabilmesini istiyor. "Onay kutusu vardı" demek yeterli değil;
  -- onayın zamanı kayda geçmeli. Ödemesiz rezervasyonlarda NULL kalır —
  -- mesafeli satış yoksa onaylanacak bir sözleşme de yoktur.
  terms_accepted_at TEXT,

  -- Ödemenin onaylandığı an. `confirmed` durumuna geçişin zamanı.
  confirmed_at   TEXT,
  -- Ödeme süresi dolduğu için düşürüldüğü an.
  expired_at     TEXT,
  redeemed_at    TEXT,
  redeemed_by    TEXT,

  -- Saati değiştirildiyse ne zaman. Kaç kez taşındığı ve nereden nereye
  -- taşındığı işlem günlüğünde; burada yalnızca "bu rezervasyon taşındı"
  -- bilgisi var ve listede rozet göstermeye yetiyor.
  rescheduled_at TEXT,

  -- İptalin kim/ne tarafından yapıldığı. Hava kaynaklı iptal ayrı tutulur:
  -- müşteri kusurlu olmadığı için iade ve yeniden planlama politikası farklı
  -- işler. Sonradan eklemek şema göçü gerektirirdi.
  cancelled_at   TEXT,
  cancel_reason  TEXT CHECK (cancel_reason IN ('customer', 'operator', 'weather')),

  CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL) OR
    (status <> 'cancelled' AND cancelled_at IS NULL AND cancel_reason IS NULL)
  ),

  -- Tek kullanım güvencesinin şema tarafındaki yarısı: onaylanmış bir kaydın
  -- zaman damgası olmak zorunda, onaylanmamışın olmamak zorunda.
  CHECK (
    (status = 'redeemed' AND redeemed_at IS NOT NULL) OR
    (status <> 'redeemed' AND redeemed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_operator ON bookings(operator_id, booking_date);
-- Süresi dolan ödemeleri süpüren iş bu indeksi kullanır.
CREATE INDEX IF NOT EXISTS idx_bookings_pending ON bookings(status, created_at);

-- Ödeme kayıtları.
--
-- Bir rezervasyonun birden çok ödeme DENEMESİ olabilir (kart reddedildi,
-- kullanıcı vazgeçti, tekrar denedi); bu yüzden ayrı tablo.
--
-- KART NUMARASI HİÇBİR ZAMAN BURAYA YAZILMAZ. iyzico'nun barındırdığı
-- Checkout Form kullanıldığı için kart verisi RASTLA'nın sunucusuna hiç
-- değmez; yalnızca sağlayıcının döndürdüğü MASKELİ bilgi saklanır.
CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,
  booking_id      TEXT NOT NULL REFERENCES bookings(id),

  provider        TEXT NOT NULL,          -- 'iyzico' | 'fake'
  -- Sağlayıcının bu ödeme için verdiği kimlik (iyzico: paymentId).
  provider_ref    TEXT,
  -- Bizim ürettiğimiz ve sağlayıcıya gönderdiğimiz eşleştirme kimliği.
  -- Geri dönen cevabın hangi rezervasyona ait olduğu bununla doğrulanır.
  conversation_id TEXT NOT NULL UNIQUE,
  -- Checkout Form oturum anahtarı; sonucu sağlayıcıdan bununla sorarız.
  token           TEXT,

  amount_try      INTEGER NOT NULL CHECK (amount_try >= 0),
  -- RASTLA'nın payı. İşletmeye aktarılan tutar: amount_try - commission_try.
  commission_try  INTEGER NOT NULL DEFAULT 0 CHECK (commission_try >= 0),
  currency        TEXT NOT NULL DEFAULT 'TRY',

  status          TEXT NOT NULL
                  CHECK (status IN ('initiated', 'succeeded', 'failed', 'refunded')),

  -- Sağlayıcıdan dönen MASKELİ kart bilgisi. Fişte ve destek görüşmesinde
  -- "hangi kartla ödedim" sorusunu cevaplar; kartı yeniden kullanmaya yetmez.
  -- iyzico'nun kalem işlem kimliği (itemTransactions[].paymentTransactionId).
  --
  -- Alt üye işyerine giden payı serbest bırakmak ya da geri çevirmek için
  -- ONAY çağrısının anahtarı budur; paymentId değil. Önce yakalanmıyordu ve
  -- onay akışı bu yüzden kurulamıyordu.
  item_transaction_ref TEXT,

  card_family     TEXT,
  card_last_four  TEXT CHECK (card_last_four IS NULL OR length(card_last_four) = 4),

  failure_reason  TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,

  CHECK (commission_try <= amount_try)
);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_token ON payments(token);

-- İadeler. Ayrı tablo: bir ödeme kısmi olarak birden çok kez iade edilebilir
-- ve her iadenin sağlayıcı tarafında ayrı bir kimliği vardır.
CREATE TABLE IF NOT EXISTS refunds (
  id            TEXT PRIMARY KEY,
  payment_id    TEXT NOT NULL REFERENCES payments(id),

  amount_try    INTEGER NOT NULL CHECK (amount_try > 0),
  -- weather/operator -> müşteri kusurlu değil, tam iade
  -- customer         -> iptal politikasına tabi
  reason        TEXT NOT NULL CHECK (reason IN ('customer', 'operator', 'weather')),

  provider_ref  TEXT,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  failure_reason TEXT,
  created_at    TEXT NOT NULL,

  -- Aynı ödeme aynı sebeple iki kez iade edilemez: çift tıklama ya da
  -- tekrarlanan webhook, parayı iki kez geri göndermemeli.
  UNIQUE (payment_id, reason)
);

CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);

-- Hak ediş defteri: işletmenin her rezervasyondan ne kazandığı.
--
-- Neden ayrı tablo, neden `payments` yetmiyor: ödeme MÜŞTERİ tarafındaki
-- olaydır ("para tahsil edildi mi"), hak ediş İŞLETME tarafındaki olaydır
-- ("bu paranın ne kadarı ne zaman işletmenin oldu"). İkisi aynı satırda
-- tutulsaydı, ödemesi alınmış ama hizmeti verilmemiş bir rezervasyonun tutarı
-- "kazanılmış" görünürdü.
--
-- Akış: ödeme onaylanınca kayıt `held` olarak açılır — para RASTLA'da, alt üye
-- işyerinin payı sağlayıcıda BLOKE. Bilet okutulunca (hizmet verildi) `released`
-- olur ve sağlayıcıya onay çağrısı gider. Müşteri gelmediyse ya da iade
-- edildiyse `reversed` olur.
--
-- **`booking_id` UNIQUE, ve bu tesadüf değil.** Tek kullanım güvencesinin hak
-- ediş tarafındaki karşılığı bu: aynı rezervasyon için ikinci bir hak ediş
-- satırı veritabanı tarafından reddedilir. "Önce bak, varsa ekleme" yazılsaydı
-- iki eşzamanlı geri çağrı arasından ikisi de geçebilirdi.
CREATE TABLE IF NOT EXISTS payouts (
  id             TEXT PRIMARY KEY,
  booking_id     TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  payment_id     TEXT NOT NULL REFERENCES payments(id),
  operator_id    TEXT NOT NULL,

  gross_try      INTEGER NOT NULL CHECK (gross_try >= 0),
  -- RASTLA'nın payı. Ödeme anındaki oranla DONDURULUR: komisyon oranı
  -- sonradan değişse bile geçmiş hak edişler değişmez, yoksa mutabakat
  -- geriye dönük olarak bozulurdu.
  commission_try INTEGER NOT NULL DEFAULT 0 CHECK (commission_try >= 0),
  refunded_try   INTEGER NOT NULL DEFAULT 0 CHECK (refunded_try >= 0),
  -- gross - commission - refunded. Türetilebilir ama saklanıyor: mutabakat
  -- raporu bu sütunu doğrudan topluyor ve hesabın hangi anki değerlerle
  -- yapıldığı kayda geçmiş oluyor.
  net_try        INTEGER NOT NULL,

  -- held     -> hizmet verilmedi, pay sağlayıcıda bloke
  -- released -> bilet okutuldu, pay işletmeye serbest bırakıldı
  -- reversed -> gelmedi ya da iade edildi, pay geri çevrildi
  status         TEXT NOT NULL CHECK (status IN ('held', 'released', 'reversed')),

  -- Sağlayıcıdaki kalem işlem kimliği; onay/geri çevirme çağrısının anahtarı.
  provider_ref   TEXT,
  -- Sağlayıcıya giden onay çağrısı başarısız olursa sebebi burada durur.
  -- Defterdeki durum yine de ilerler: "işletme bunu hak etti" bizim
  -- kararımızdır, sağlayıcıya iletmek ise tekrarlanabilir bir teslim adımıdır.
  failure_reason TEXT,

  held_at        TEXT NOT NULL,
  released_at    TEXT,
  reversed_at    TEXT,

  CHECK (
    (status = 'released' AND released_at IS NOT NULL) OR
    (status <> 'released' AND released_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_payouts_operator ON payouts(operator_id, status);

-- İşletmenin yüklediği aktivite görselleri.
--
-- Dosyanın KENDİSİ burada değil; burada yalnızca depodaki anahtarı ve
-- görüntülemek için gereken bilgi var. İkili veriyi veritabanına koymak
-- yedekleri şişirir ve her sorguyu yavaşlatırdı.
--
-- Yüklenen dosya OLDUĞU GİBİ saklanmaz: sunucuda yeniden kodlanır. Sebebi
-- mahremiyet — işletmenin telefonuyla çektiği fotoğraf EXIF içinde çekim
-- konumunu ve çoğu zaman cihaz seri numarasını taşır. Yeniden kodlama bunların
-- hepsini düşürür (bkz. lib/images.ts).
CREATE TABLE IF NOT EXISTS activity_images (
  id            TEXT PRIMARY KEY,
  activity_id   TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,

  -- Depodaki anahtar. Yerel depoda dosya adı, Vercel Blob'da yol.
  storage_key   TEXT NOT NULL,
  content_type  TEXT NOT NULL,

  -- Görme engelli kullanıcılar ve görsel yüklenmediğinde gösterilecek metin.
  -- Boş bırakılabilir ama işletmeye doldurması söylenir.
  alt           TEXT,

  width         INTEGER NOT NULL CHECK (width > 0),
  height        INTEGER NOT NULL CHECK (height > 0),
  bytes         INTEGER NOT NULL CHECK (bytes > 0),

  -- Sıralama. 0 kapak görselidir; aktivite kartlarında ve listede o görünür.
  position      INTEGER NOT NULL DEFAULT 0,

  -- Yükleyen personelin hesabı. Bir uyuşmazlıkta "bu fotoğrafı kim koydu"
  -- sorusunun cevabı olmalı.
  uploaded_by   TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_images_activity
  ON activity_images(activity_id, position);

-- İşlem günlüğü.
--
-- Veri ihlali müdahale planının 3. adımı "hangi veriler, kaç kişi, gerçekten
-- erişildi mi" sorularını sorar. Bu tablo olmadan o adım tahmine kalır.
-- Ayrıca uyuşmazlıklarda "bileti kim onayladı", "aktiviteyi kim yayından
-- kaldırdı" gibi sorulara cevap verir.
--
-- Bilinçli olarak yalnızca EKLEME yapılır: kayıt güncellenmez, silinmez.
-- Silme yalnızca saklama süresi dolan kayıtların toplu imhasıyla olur.
CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,
  at           TEXT NOT NULL,   -- ISO 8601, UTC

  -- Eylemi kim yaptı.
  --   operator -> operator_users.id
  --   customer -> users.id
  --   system   -> otomatik iş (aktör kimliği yok)
  --   anonymous-> oturum açmamış istek (başarısız giriş denemesi)
  actor_type   TEXT NOT NULL CHECK (actor_type IN ('operator', 'customer', 'system', 'anonymous')),
  actor_id     TEXT,
  operator_id  TEXT,            -- işletme bağlamı; işletme kendi günlüğünü görebilsin

  action       TEXT NOT NULL,   -- 'booking.redeem', 'operator.login_failed' …
  target_type  TEXT,            -- 'booking' | 'activity' | 'operator_user' | 'slot'
  target_id    TEXT,

  -- Sonuç: başarısız denemeler de kaydedilir. İhlali fark ettiren çoğunlukla
  -- başarılı işlemler değil, başarısız denemelerin yoğunluğudur.
  outcome      TEXT NOT NULL DEFAULT 'success'
               CHECK (outcome IN ('success', 'failure', 'denied')),

  -- IP ve tarayıcı bilgisi de kişisel veridir; saklama süresi
  -- veri-saklama-imha-politikasi.md ile sınırlıdır.
  ip           TEXT,
  user_agent   TEXT,

  -- Eyleme özgü ek bilgi (JSON). Misafir adı, telefon gibi kişisel veriler
  -- BURAYA YAZILMAZ — günlük zaten hangi kaydı işaret ettiğini biliyor.
  meta         TEXT
);

-- Telefon doğrulama kodları (OTP).
--
-- Kod DÜZ METİN SAKLANMAZ, özeti saklanır. Veritabanı sızarsa yalnızca geçmiş
-- kayıtlar değil, o an CANLI olan doğrulama kodları da sızmış olurdu; saldırgan
-- bekleyen bir girişi tamamlayabilirdi.
--
-- Parola özetindeki scrypt burada bilinçli olarak kullanılmıyor: kod 6 haneli
-- ve 5 dakika yaşıyor, dolayısıyla çevrimdışı kırma penceresi yok; buna karşılık
-- her kod denemesinde 100 ms scrypt çalıştırmak doğrulama ekranını gözle
-- görülür biçimde yavaşlatırdı. Tuzlu SHA-256 bu iş için doğru denge.
CREATE TABLE IF NOT EXISTS phone_verifications (
  id           TEXT PRIMARY KEY,
  phone        TEXT NOT NULL,        -- normalize edilmiş (90…)
  code_hash    TEXT NOT NULL,        -- sha256$<tuz>$<özet>
  purpose      TEXT NOT NULL CHECK (purpose IN ('booking', 'operator_login')),

  -- İşletme 2FA'sında kodun hangi hesap için üretildiği. Müşteri akışında NULL.
  operator_user_id TEXT,

  expires_at   TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at  TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phone_verifications_lookup
  ON phone_verifications(phone, purpose, consumed_at);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_expiry
  ON phone_verifications(expires_at);

-- Otomatik güvenlik uyarıları.
--
-- İşlem günlüğü tutulmakla iş bitmiyor: kimse bakmazsa bir saldırı orada
-- sessizce durur. Bu tablo, kurallardan (lib/alerts/rules.ts) çıkan bulguları
-- tutar ve e-postayla haber verilenleri işaretler.
--
-- **`dedupe_key` bu tablonun tamamının dayandığı fikirdir.** İçinde bir ZAMAN
-- KOVASI var (`kural:hedef:saat`) ve ekleme `ON CONFLICT DO NOTHING` ile
-- yapılıyor. Bunun iki sonucu var:
--
--   1. Bekleme süresi bedavaya geliyor — aynı kural aynı hedef için aynı saat
--      içinde kaç kez tetiklenirse tetiklensin tek satır oluşur. Yoksa 500
--      başarısız giriş 500 e-posta demek olurdu ve o e-postalar okunmazdı.
--   2. "Önce bak, sonra yaz" yarışı hiç doğmuyor. İki süpürme aynı anda
--      çalışsa bile ikinci ekleme veritabanı tarafından sessizce düşürülür.
--      Kontrol kodda olsaydı ikisi de "yok" görüp ikisi de yazabilirdi.
-- Hava tahmini — aktivite ve gün başına tek satır.
--
-- Tahmin sağlayıcıdan geliyor ama **saklanıyor**, çünkü panel her açıldığında
-- dış servise gitmek hem yavaş hem de o servisin ayakta olmasına bağımlı
-- olurdu. Sabah çalışan iş tahmini bir kez çeker, ekranlar bu tablodan okur.
--
-- `verdict` ölçümden değil KARŞILAŞTIRMADAN çıkıyor: aynı rüzgâr bir tekne
-- turu için sorunsuz, bir SUP dersi için elverişsiz olabilir. Bu yüzden
-- karşılaştırma aktivitenin kendi eşikleriyle yapılıyor ve sonuç aktivite
-- başına saklanıyor.
--
-- **`bilinmiyor` gerçek bir durum, hata değil.** Sağlayıcıya ulaşılamadığında
-- bu yazılır ve hiçbir şey işaretlenmez. Eksik veriden "riskli" sonucu
-- çıkarmak, tahminin kendisinden daha kötü bir yanlış olurdu.
CREATE TABLE IF NOT EXISTS weather_forecasts (
  id             TEXT PRIMARY KEY,
  activity_id    TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  forecast_date  TEXT NOT NULL,   -- YYYY-MM-DD

  wind_kmh       REAL,
  gust_kmh       REAL,
  wave_m         REAL,
  precipitation_mm REAL,

  verdict        TEXT NOT NULL
                 CHECK (verdict IN ('uygun', 'riskli', 'elverissiz', 'bilinmiyor')),
  -- Hangi eşiğin aşıldığı: arayüzde gerekçe olarak gösteriliyor.
  reason         TEXT,

  fetched_at     TEXT NOT NULL,

  -- Aynı gün için ikinci satır olmamalı: iş günde birden çok kez koşturulsa
  -- da tahmin güncellenir, çoğalmaz.
  UNIQUE (activity_id, forecast_date)
);

CREATE INDEX IF NOT EXISTS idx_weather_date ON weather_forecasts(forecast_date);

CREATE TABLE IF NOT EXISTS alerts (
  id           TEXT PRIMARY KEY,
  at           TEXT NOT NULL,

  -- Kuralın kimliği (lib/alerts/rules.ts içindeki `id`).
  rule         TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),

  -- Uyarının ilgili olduğu işletme. NULL = sistem geneli.
  operator_id  TEXT,

  -- Kural + hedef + zaman kovası. UNIQUE olması uyarı fırtınasını önler.
  dedupe_key   TEXT NOT NULL UNIQUE,

  -- İnsanın okuyacağı özet ve sayısal ayrıntı (JSON).
  summary      TEXT NOT NULL,
  details      TEXT,

  -- E-posta gönderildiği an. NULL ise henüz haber verilmemiş.
  notified_at  TEXT,
  -- İşletme "gördüm" dediğinde dolar; açık uyarılar ekranda bayrak gösterir.
  resolved_at  TEXT,
  resolved_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_open ON alerts(resolved_at, at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_operator ON alerts(operator_id, at DESC);

-- Hız sınırı sayaçları.
--
-- Sabit pencere sayacı: her kova (ör. "login:ip:1.2.3.4") bir pencere
-- başlangıcı ve o pencerede kaç deneme yapıldığını tutar.
--
-- Sabit pencerenin bilinen zayıflığı, pencere sınırında iki katı denemeye
-- izin vermesidir (bir pencerenin sonunda N, hemen ardından yenisinin
-- başında N). Kayan pencere bunu çözerdi ama her denemenin zaman damgasını
-- saklamayı gerektirirdi. Kaba kuvvete karşı bu fark önemsiz: 92 bit
-- entropili bir parolayı denemek için 5 yerine 10 hakkın olması hiçbir şeyi
-- değiştirmez. Basitlik ve tek ifadeyle atomiklik tercih edildi.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket        TEXT PRIMARY KEY,
  window_start  TEXT NOT NULL,   -- ISO 8601
  count         INTEGER NOT NULL CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_operator ON audit_log(operator_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_type, actor_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, at DESC);
