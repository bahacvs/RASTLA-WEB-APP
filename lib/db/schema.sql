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
  created_at  TEXT NOT NULL
);

-- Hizmeti veren işletme. Önceden lib/operators.ts içinde sabit bir diziydi.
CREATE TABLE IF NOT EXISTS operators (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL
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

  -- scrypt$N$r$p$salt$hash — parametreler kaydın içinde taşınır, böylece
  -- maliyet ilerideki donanıma göre artırıldığında eski kayıtlar da
  -- doğrulanmaya devam eder.
  password_hash  TEXT NOT NULL,

  -- owner: ekip yönetebilir, aktivite düzenleyebilir
  -- staff: yalnızca bilet okutur ve rezervasyon görür
  role           TEXT NOT NULL CHECK (role IN ('owner', 'staff')),

  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'suspended')),

  created_at     TEXT NOT NULL,
  last_login_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_operator_users_operator ON operator_users(operator_id, status);

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

  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at   TEXT NOT NULL,

  -- Aşırı rezervasyona karşı şema tarafındaki güvence. Koşullu UPDATE zaten
  -- engeller; bu kısıt son savunma hattıdır.
  CHECK (booked >= 0 AND booked <= capacity),

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

  booking_date   TEXT NOT NULL,   -- YYYY-MM-DD
  booking_time   TEXT NOT NULL,   -- HH:MM
  adults         INTEGER NOT NULL,
  children       INTEGER NOT NULL,
  total_try      INTEGER NOT NULL,

  -- confirmed -> onay bekleyen geçerli bilet
  -- redeemed  -> işletme tarafından okutulup kullanıldı (geri dönüşü yok)
  -- cancelled -> iptal
  status         TEXT NOT NULL CHECK (status IN ('confirmed', 'redeemed', 'cancelled')),

  created_at     TEXT NOT NULL,
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
