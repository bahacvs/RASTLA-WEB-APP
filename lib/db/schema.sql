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

CREATE TABLE IF NOT EXISTS bookings (
  id             TEXT PRIMARY KEY,

  -- Bilette ve QR'da görünen kod. Yüksek entropili ve rastgele; tahmin
  -- edilemediği için ayrıca imzalanmasına gerek yok.
  code           TEXT NOT NULL UNIQUE,

  user_id        TEXT NOT NULL REFERENCES users(id),
  activity_slug  TEXT NOT NULL,
  operator_id    TEXT NOT NULL,

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

  -- Tek kullanım güvencesinin şema tarafındaki yarısı: onaylanmış bir kaydın
  -- zaman damgası olmak zorunda, onaylanmamışın olmamak zorunda.
  CHECK (
    (status = 'redeemed' AND redeemed_at IS NOT NULL) OR
    (status <> 'redeemed' AND redeemed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_operator ON bookings(operator_id, booking_date);
