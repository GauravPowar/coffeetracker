// functions/api/logs.ts
// Cloudflare Pages Function — handles /api/logs, /api/journal, /api/shelf

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, status = 200) =>
  Response.json(data, { status, headers: CORS });

// ════════════════════════════════════════════════════════
//  AUTH HELPERS
// ════════════════════════════════════════════════════════

async function verifyUser(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const idToken = authHeader.split(" ")[1];
  
  // Verify token with Google
  // Note: For production, you might want to use a JWT library to avoid the extra fetch,
  // but this is the most compatible way for Cloudflare Workers without external deps.
  const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
  
  if (!resp.ok) {
    throw new Error("Invalid Google Token");
  }

  const payload: any = await resp.json();
  
  // Check if token is expired or has wrong audience if we had CLIENT_ID
  // payload.aud should match your GOOGLE_CLIENT_ID
  
  return {
    userId: payload.sub, // Unique Google User ID
    email: payload.email,
    name: payload.name,
    picture: payload.picture
  };
}

// ════════════════════════════════════════════════════════
//  DATA HELPERS
// ════════════════════════════════════════════════════════

function normalizeCategory(cat: any) {
  const c = (cat || "").toLowerCase().trim();
  if (c === "beans" || c === "coffee" || c === "online") return "beans";
  if (c === "gears" || c === "gear" || c === "equipment") return "gears";
  if (c === "accessories" || c === "accessory" || c === "offline") return "accessories";
  return c;
}

function makeOrderId() { return "LOCAL-" + Date.now(); }

function getRoute(request: any) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/$/, "");
  if (p.endsWith("/journal")) return "journal";
  if (p.endsWith("/shelf")) return "shelf";
  const qr = url.searchParams.get("route");
  if (qr === "journal") return "journal";
  if (qr === "shelf") return "shelf";
  return "logs";
}

async function runMigrations(db: any) {
  const migrations = [
    // Ensure tables exist
    `CREATE TABLE IF NOT EXISTS orders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT    NOT NULL,
      order_id    TEXT    NOT NULL,
      date        TEXT    NOT NULL,
      vendor      TEXT    NOT NULL,
      is_combo    INTEGER DEFAULT 0,
      combo_price REAL    DEFAULT 0,
      notes       TEXT,
      created_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, order_id)
    )`,
    `CREATE TABLE IF NOT EXISTS logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT    NOT NULL,
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
    )`,
    `CREATE TABLE IF NOT EXISTS journal (
      id         TEXT    NOT NULL,
      user_id    TEXT    NOT NULL,
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
      updated_at TEXT    DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS shelf_meta (
      log_id         TEXT    NOT NULL,
      user_id        TEXT    NOT NULL,
      roast_date     TEXT,
      delivered_date TEXT,
      opened_date    TEXT,
      finished_date  TEXT,
      is_finished    INTEGER DEFAULT 0,
      gram_entries   TEXT,
      updated_at     TEXT    DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (log_id, user_id)
    )`,
    // Add user_id to existing tables if missing (for older DBs)
    "ALTER TABLE orders ADD COLUMN user_id TEXT DEFAULT 'legacy'",
    "ALTER TABLE logs ADD COLUMN user_id TEXT DEFAULT 'legacy'",
    "ALTER TABLE journal ADD COLUMN user_id TEXT DEFAULT 'legacy'",
    "ALTER TABLE shelf_meta ADD COLUMN user_id TEXT DEFAULT 'legacy'",
    // Other missing columns
    "ALTER TABLE logs ADD COLUMN roast_level TEXT",
    "ALTER TABLE logs ADD COLUMN process TEXT",
    "ALTER TABLE journal ADD COLUMN grinder TEXT",
  ];

  for (const m of migrations) {
    try { await db.prepare(m).run(); } catch (_) { /* already done or error */ }
  }
}

// ════════════════════════════════════════════════════════
//  GET
// ════════════════════════════════════════════════════════
export async function onRequestGet({ request, env }: { request: any, env: any }) {
  try {
    const user = await verifyUser(request);
    const db = env.DB;
    await runMigrations(db);

    const route = getRoute(request);

    if (route === "journal") {
      const { results } = await db.prepare(
        "SELECT * FROM journal WHERE user_id = ? ORDER BY date DESC"
      ).bind(user.userId).all();
      return json({ journal: results || [] });
    }

    if (route === "shelf") {
      const { results } = await db.prepare(
        "SELECT * FROM shelf_meta WHERE user_id = ?"
      ).bind(user.userId).all();
      return json({ shelf: results || [] });
    }

    const [ordersResult, logsResult] = await Promise.all([
      db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY date DESC").bind(user.userId).all(),
      db.prepare("SELECT * FROM logs WHERE user_id = ? ORDER BY date DESC").bind(user.userId).all(),
    ]);

    const orders = ordersResult.results || [];
    const logs = logsResult.results || [];

    const orderMap: Record<string, any> = {};
    const itemCounts: Record<string, number> = {};
    orders.forEach((o: any) => { orderMap[o.order_id] = o; });
    logs.forEach((l: any) => {
      const o = orderMap[l.order_id];
      if (o && o.is_combo) itemCounts[l.order_id] = (itemCounts[l.order_id] || 0) + 1;
    });

    const enrichedLogs = logs.map((l: any) => {
      const o = orderMap[l.order_id];
      if (o && o.is_combo && o.combo_price > 0) {
        return { ...l, price: o.combo_price / (itemCounts[l.order_id] || 1), is_combo_item: 1 };
      }
      return { ...l, is_combo_item: 0 };
    });

    return json({ logs: enrichedLogs, orders });

  } catch (err: any) {
    const status = err.message.includes("Authorization") || err.message.includes("Token") ? 401 : 500;
    return json({ error: err.message }, status);
  }
}

// ════════════════════════════════════════════════════════
//  POST
// ════════════════════════════════════════════════════════
export async function onRequestPost({ request, env }: { request: any, env: any }) {
  try {
    const user = await verifyUser(request);
    const db = env.DB;
    await runMigrations(db);
    const body = await request.json();
    const route = getRoute(request);

    if (route === "journal") {
      const j = body;
      await db.prepare(
        `INSERT OR REPLACE INTO journal
         (id, user_id, date, brewer, grinder, bean_id, bean_label, dose, yield, time, temp, grind, notes, rating, tastes, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`
      ).bind(
        String(j.id), user.userId, j.date || "", j.brewer || "", j.grinder || "", j.beanId || "", j.beanLabel || "",
        j.dose || 0, j.yield || 0, j.time || 0, j.temp || 0,
        j.grind || "", j.notes || "", j.rating || 0,
        JSON.stringify(j.tastes || [])
      ).run();
      return json({ ok: true });
    }

    if (route === "shelf") {
      const s = body;
      await db.prepare(
        `INSERT OR REPLACE INTO shelf_meta
         (log_id, user_id, roast_date, delivered_date, opened_date, finished_date, is_finished, gram_entries, updated_at)
         VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`
      ).bind(
        String(s.log_id), user.userId, s.roastDate || "", s.deliveredDate || "",
        s.openedDate || "", s.finishedDate || "",
        s.isFinished ? 1 : 0,
        JSON.stringify(s.gramEntries || [])
      ).run();
      return json({ ok: true });
    }

    if (body.order && body.items) {
      const o = body.order;
      const order_id = (o.order_id || o.id || "").toString().trim() || makeOrderId();
      const is_combo = body.items.length > 1 || o.is_combo ? 1 : 0;
      let combo_price = parseFloat(o.combo_price || o.price || 0);
      if (!combo_price && is_combo)
        combo_price = body.items.reduce((s: number, i: any) => s + parseFloat(i.price || 0), 0);

      await db.prepare(
        `INSERT OR IGNORE INTO orders (user_id, order_id, date, vendor, is_combo, combo_price, notes)
         VALUES (?,?,?,?,?,?,?)`
      ).bind(user.userId, order_id, o.date || new Date().toISOString().slice(0, 10),
        o.vendor || "", is_combo, combo_price, o.notes || "").run();

      for (const item of body.items) {
        await db.prepare(
          `INSERT INTO logs
           (user_id, order_id, date, category, vendor, name, price, notes, roaster, size, coffee_type, brew_equip, qty, roast_level, process)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          user.userId, order_id, o.date || new Date().toISOString().slice(0, 10),
          normalizeCategory(item.category),
          item.vendor || o.vendor || "", item.name || "",
          parseFloat(item.price || 0), item.notes || "",
          item.roaster || "", item.size || "",
          item.coffee_type || item.coffeeType || "",
          Array.isArray(item.brew_equip) ? item.brew_equip.join(",") : (item.brew_equip || item.brewEquip || ""),
          parseInt(item.qty || 1),
          item.roast_level || item.roastLevel || null,
          item.process || null
        ).run();
      }
      return json({ ok: true });
    }

    const { action } = body;

    if (action === "deleteLog") {
      const { id } = body;
      await db.prepare("DELETE FROM logs WHERE id = ? AND user_id = ?").bind(id, user.userId).run();
      await db.prepare(
        "DELETE FROM orders WHERE user_id = ? AND order_id NOT IN (SELECT DISTINCT order_id FROM logs WHERE user_id = ?)"
      ).bind(user.userId, user.userId).run();
      return json({ ok: true });
    }

    if (action === "updateLog") {
      const { id, date, category, vendor, name, price, notes, roaster, size,
        coffee_type, brew_equip, qty, roast_level, process } = body;
      await db.prepare(
        `UPDATE logs SET date=?,category=?,vendor=?,name=?,price=?,notes=?,roaster=?,size=?,
         coffee_type=?,brew_equip=?,qty=?,roast_level=?,process=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`
      ).bind(
        date, normalizeCategory(category), vendor, name, price || 0,
        notes || "", roaster || "", size || "",
        coffee_type || "", brew_equip || "", qty || 1, roast_level || null, process || null, id, user.userId
      ).run();
      return json({ ok: true });
    }

    if (action === "updateOrder") {
      const { order_id, date, vendor, is_combo, combo_price, notes } = body;
      await db.prepare(
        "UPDATE orders SET date=?,vendor=?,is_combo=?,combo_price=?,notes=? WHERE order_id=? AND user_id=?"
      ).bind(date, vendor, is_combo ? 1 : 0, combo_price || 0, notes || "", order_id, user.userId).run();
      return json({ ok: true });
    }

    if (action === "deleteJournal") {
      await db.prepare("DELETE FROM journal WHERE id=? AND user_id=?").bind(String(body.id), user.userId).run();
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);

  } catch (err: any) {
    const status = err.message.includes("Authorization") || err.message.includes("Token") ? 401 : 500;
    return json({ error: err.message }, status);
  }
}

// ════════════════════════════════════════════════════════
//  PUT
// ════════════════════════════════════════════════════════
export async function onRequestPut({ request, env }: { request: any, env: any }) {
  try {
    const user = await verifyUser(request);
    const db = env.DB;
    await runMigrations(db);
    const body = await request.json();
    const route = getRoute(request);

    if (route === "journal") {
      const j = body;
      await db.prepare(
        `UPDATE journal SET date=?,brewer=?,grinder=?,bean_id=?,bean_label=?,dose=?,yield=?,time=?,temp=?,
         grind=?,notes=?,rating=?,tastes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`
      ).bind(
        j.date || "", j.brewer || "", j.grinder || "", j.beanId || "", j.beanLabel || "",
        j.dose || 0, j.yield || 0, j.time || 0, j.temp || 0,
        j.grind || "", j.notes || "", j.rating || 0,
        JSON.stringify(j.tastes || []), String(j.id), user.userId
      ).run();
      return json({ ok: true });
    }

    if (route === "shelf") {
      const s = body;
      await db.prepare(
        `INSERT OR REPLACE INTO shelf_meta
         (log_id, user_id, roast_date, delivered_date, opened_date, finished_date, is_finished, gram_entries, updated_at)
         VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`
      ).bind(
        String(s.log_id), user.userId, s.roastDate || "", s.deliveredDate || "",
        s.openedDate || "", s.finishedDate || "",
        s.isFinished ? 1 : 0,
        JSON.stringify(s.gramEntries || [])
      ).run();
      return json({ ok: true });
    }

    // Generic log update
    if (body.id) {
      await db.prepare(
        `UPDATE logs SET date=?,category=?,vendor=?,name=?,price=?,notes=?,roaster=?,size=?,
         coffee_type=?,brew_equip=?,qty=?,roast_level=?,process=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`
      ).bind(
        body.date, normalizeCategory(body.category),
        body.vendor || "", body.name || "", parseFloat(body.price || 0),
        body.notes || "", body.roaster || "", body.size || "",
        body.coffee_type || body.coffeeType || "",
        Array.isArray(body.brew_equip) ? body.brew_equip.join(",") : (body.brew_equip || body.brewEquip || ""),
        parseInt(body.qty || 1),
        body.roast_level || body.roastLevel || null,
        body.process || null,
        body.id, user.userId
      ).run();
      if (body.order_id) {
        await db.prepare("UPDATE orders SET date=?,vendor=? WHERE order_id=? AND user_id=?")
          .bind(body.date, body.vendor || "", body.order_id, user.userId).run();
      }
      return json({ ok: true });
    }

    return json({ error: "Invalid PUT body" }, 400);
  } catch (err: any) {
    const status = err.message.includes("Authorization") || err.message.includes("Token") ? 401 : 500;
    return json({ error: err.message }, status);
  }
}

// ════════════════════════════════════════════════════════
//  DELETE
// ════════════════════════════════════════════════════════
export async function onRequestDelete({ request, env }: { request: any, env: any }) {
  try {
    const user = await verifyUser(request);
    const db = env.DB;
    await runMigrations(db);
    const body = await request.json();
    const route = getRoute(request);

    if (route === "journal") {
      await db.prepare("DELETE FROM journal WHERE id=? AND user_id=?").bind(String(body.id), user.userId).run();
      return json({ ok: true });
    }

    if (route === "shelf") {
      await db.prepare("DELETE FROM shelf_meta WHERE log_id=? AND user_id=?").bind(String(body.log_id), user.userId).run();
      return json({ ok: true });
    }

    const { id, order_id } = body;
    if (id) await db.prepare("DELETE FROM logs WHERE id=? AND user_id=?").bind(id, user.userId).run();
    if (order_id) {
      await db.prepare("DELETE FROM logs WHERE order_id=? AND user_id=?").bind(order_id, user.userId).run();
      await db.prepare("DELETE FROM orders WHERE order_id=? AND user_id=?").bind(order_id, user.userId).run();
    }
    
    return json({ ok: true });
  } catch (err: any) {
    const status = err.message.includes("Authorization") || err.message.includes("Token") ? 401 : 500;
    return json({ error: err.message }, status);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
