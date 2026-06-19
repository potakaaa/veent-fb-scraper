CREATE TABLE IF NOT EXISTS events (
  id                   SERIAL PRIMARY KEY,
  event_url            TEXT NOT NULL,
  event_url_normalized TEXT NOT NULL UNIQUE,
  title                TEXT NOT NULL,
  start_datetime       TEXT,
  end_datetime         TEXT,
  venue_name           TEXT,
  city_location        TEXT,
  organizer_name       TEXT,
  short_description    TEXT,
  source_search_term   TEXT NOT NULL,
  collected_at         TEXT NOT NULL,
  exported_at          TEXT,
  respondent_count     INTEGER NOT NULL DEFAULT 0,
  notes                TEXT,
  enriched_at          TEXT,
  source               TEXT NOT NULL DEFAULT 'facebook'
);

CREATE INDEX IF NOT EXISTS idx_collected_at ON events(collected_at);
CREATE INDEX IF NOT EXISTS idx_source_term  ON events(source_search_term);
