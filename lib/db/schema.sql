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

  -- RASTLA'nın payı, on binde. 1000 = %10. Tam sayı tutuluyor ki kuruş
  -- hesabında kayan nokta yuvarlaması olmasın.
  commission_bp   INTEGER NOT NULL DEFAULT 1000
                  CHECK (commission_bp >= 0 AND commission_bp <= 10000)
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

  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published')),

  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_operator ON activities(operator_id);
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);

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

  booking_date   TEXT NOT NULL,   -- YYYY-MM-DD
  booking_time   TEXT NOT NULL,   -- HH:MM
  adults         INTEGER NOT NULL,
  children       INTEGER NOT NULL,
  total_try      INTEGER NOT NULL,

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
