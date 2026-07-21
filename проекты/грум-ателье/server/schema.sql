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
