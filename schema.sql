-- ── MIGRATION (run this if upgrading an existing DB) ────────
-- ALTER TABLE logs ADD COLUMN process TEXT;
-- ─────────────────────────────────────────────────────────────

-- Brew Log · schema.sql
-- Run via: wrangler d1 execute coffeeforgaurav --file=schema.sql

DROP TABLE IF EXISTS journal;
DROP TABLE IF EXISTS shelf_meta;
DROP TABLE IF EXISTS logs;
DROP TABLE IF EXISTS orders;

-- ── ORDERS ──────────────────────────────────────────────
CREATE TABLE orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT    NOT NULL UNIQUE,
  date        TEXT    NOT NULL,
  vendor      TEXT    NOT NULL,
  is_combo    INTEGER DEFAULT 0,
  combo_price REAL    DEFAULT 0,
  notes       TEXT,
  created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- ── PURCHASE LOGS ───────────────────────────────────────
CREATE TABLE logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT    NOT NULL,
  date        TEXT    NOT NULL,
  category    TEXT    NOT NULL,
  vendor      TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  price       REAL    DEFAULT 0,
  notes       TEXT,
  roaster     TEXT,
  size        TEXT,
  coffee_type TEXT,
  brew_equip  TEXT,
  qty         INTEGER DEFAULT 1,
  roast_level TEXT,
  process     TEXT,
  created_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- ── BREW JOURNAL ─────────────────────────────────────────
CREATE TABLE journal (
  id         TEXT    PRIMARY KEY,
  date       TEXT    NOT NULL,
  brewer     TEXT,
  bean_id    TEXT,
  bean_label TEXT,
  dose       REAL    DEFAULT 0,
  yield      REAL    DEFAULT 0,
  time       REAL    DEFAULT 0,
  temp       REAL    DEFAULT 0,
  grinder    TEXT,
  grind      TEXT,
  notes      TEXT,
  rating     INTEGER DEFAULT 0,
  tastes     TEXT,
  created_at TEXT    DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- ── SHELF / BAG META ─────────────────────────────────────
CREATE TABLE shelf_meta (
  log_id         TEXT    PRIMARY KEY,
  roast_date     TEXT,
  delivered_date TEXT,
  opened_date    TEXT,
  finished_date  TEXT,
  is_finished    INTEGER DEFAULT 0,
  gram_entries   TEXT,
  updated_at     TEXT    DEFAULT CURRENT_TIMESTAMP
);
