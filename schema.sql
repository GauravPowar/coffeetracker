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

-- ── SEED DATA ────────────────────────────────────────────
INSERT INTO orders (order_id, date, vendor, is_combo, combo_price, notes) VALUES
('577387',                 '2025-05-11','Blue Tokai',        1,1640,'Trio Pack combo'),
('578084',                 '2025-05-13','Blue Tokai',        0,0,''),
('solo-3',                 '2025-06-20','Coffee Hypothesis', 0,0,''),
('2137',                   '2025-07-09','Caarabi',           0,0,''),
('2650',                   '2025-07-20','Baarbara Estate',   0,0,''),
('solo-6',                 '2025-07-30','Kruti Coffee',      0,0,''),
('405-3267493-7718762',    '2025-07-31','Amazon',            0,0,''),
('405-5091926-3500342',    '2025-08-04','Amazon',            0,0,''),
('41294',                  '2025-08-08','Araku',             0,0,''),
('ORD-IN-00086360',        '2025-08-14','Shiprocket',        0,0,''),
('184015371FEE',           '2025-08-21','Corridor Seven',    0,0,''),
('405-7543985-8794710',    '2025-09-02','Amazon',            0,0,''),
('43116',                  '2025-09-16','Araku',             0,0,''),
('2981591',                '2025-01-01','Robu.in',           0,0,'');

INSERT INTO logs (order_id,date,category,vendor,name,price,notes,roaster,size,coffee_type,brew_equip,qty,roast_level) VALUES
('577387',             '2025-05-11','beans','Blue Tokai',        'The Rich Bold Trio Pack',                      0,   '','Blue Tokai',       '',    'blend',         '["French Press"]',                     1,NULL),
('578084',             '2025-05-13','beans','Blue Tokai',        'Amaltas Blend Dhak Blend',                     918, '','Blue Tokai',       '',    'blend',         '["French Press"]',                     1,NULL),
('solo-3',             '2025-06-20','beans','Coffee Hypothesis', '100 Arabica Pre-grounds',                      1200,'Pre-ground','Coffee Hypothesis','500g','',    '["French Press"]',                     1,NULL),
('2137',               '2025-07-09','beans','Caarabi',           'Baarbara Washed AA',                           550, '','Baarbara Estate',  '250g','single-estate', '["Cafflano Kompresso"]',                1,NULL),
('2137',               '2025-07-09','gears','Caarabi',           'Cafflano Kompresso',                           4300,'','',                '',    '',               '[]',                                    1,NULL),
('2650',               '2025-07-20','beans','Baarbara Estate',   'Honey Sun Dried',                              517, '','Baarbara Estate',  '',    'single-estate', '["Cafflano Kompresso","French Press"]', 1,NULL),
('solo-6',             '2025-07-30','beans','Kruti Coffee',      'Kindiriguda Naturals Pre-ground',              650, 'Natural process','Kruti Coffee','250g','single-estate','["French Press"]',             1,NULL),
('405-3267493-7718762','2025-07-31','gears','Amazon',            'Hoffen Scale',                                 999, '','','','','[]',1,NULL),
('405-5091926-3500342','2025-08-04','gears','Amazon',            'Sipologie French Press',                       560, '','','','','[]',1,NULL),
('41294',              '2025-08-08','beans','Araku',             'Selection',                                    542, '','Araku',            '',    'blend',         '["Cafflano Kompresso"]',                1,NULL),
('ORD-IN-00086360',    '2025-08-14','gears','Shiprocket',        '1Zpresso Q Air Grinder',                       5999,'','','','','[]',1,NULL),
('184015371FEE',       '2025-08-21','beans','Corridor Seven',    'Salawara Estate 72hr Anaerobic Red Wine Honey',2144,'72hr Anaerobic Fermentation','Corridor Seven','500g','single-estate','["Cafflano Kompresso"]',1,NULL),
('405-7543985-8794710','2025-09-02','accessories','Amazon',      'Grinder Cleaning Gears',                       238, '','','','','[]',1,NULL),
('43116',              '2025-09-16','beans','Araku',             'Selection',                                    657, '','Araku',            '',    'blend',         '["Cafflano Kompresso"]',                1,NULL),
('2981591',            '2025-01-01','gears','Robu.in',           '3D Tamping Station',                           494, '','','','','[]',1,NULL);
