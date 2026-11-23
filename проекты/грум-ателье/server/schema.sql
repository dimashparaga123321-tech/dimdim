CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  groomer_id TEXT NOT NULL,
  booking_date TEXT NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (start_min >= 0),
  CHECK (end_min > start_min)
);

CREATE INDEX IF NOT EXISTS bookings_schedule_idx
  ON bookings (booking_date, groomer_id, start_min, end_min);

CREATE TABLE IF NOT EXISTS groomer_reviews (
  id TEXT PRIMARY KEY,
  groomer_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  review_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (rating BETWEEN 1 AND 5),
  CHECK (length(author_name) BETWEEN 1 AND 50),
  CHECK (length(review_text) BETWEEN 5 AND 500)
);

CREATE INDEX IF NOT EXISTS groomer_reviews_list_idx
  ON groomer_reviews (groomer_id, created_at DESC);
