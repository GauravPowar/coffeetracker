export async function onRequestGet({ env }) {
  try {
    const db = env.DB;

    const [ordersResult, logsResult] = await Promise.all([
      db.prepare("SELECT * FROM orders ORDER BY date DESC").all(),
      db.prepare("SELECT * FROM logs ORDER BY date DESC").all(),
    ]);

    const orders = ordersResult.results || [];
    const logs   = logsResult.results  || [];

    const orderMap   = {};
    const itemCounts = {};
    orders.forEach(o => { orderMap[o.order_id] = o; });
    logs.forEach(l => {
      const o = orderMap[l.order_id];
      if (o && o.is_combo) {
        itemCounts[l.order_id] = (itemCounts[l.order_id] || 0) + 1;
      }
    });

    const enrichedLogs = logs.map(l => {
      const o = orderMap[l.order_id];
      if (o && o.is_combo && o.combo_price > 0) {
        return { ...l, price: o.combo_price / (itemCounts[l.order_id] || 1), is_combo_item: 1 };
      }
      return { ...l, is_combo_item: 0 };
    });

    return Response.json(
      { logs: enrichedLogs, orders },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function normalizeCategory(cat) {
  const c = (cat || '').toLowerCase().trim();
  if (c === 'beans' || c === 'coffee' || c === 'online') return 'beans';
  if (c === 'gears' || c === 'gear'  || c === 'equipment') return 'gears';
  if (c === 'accessories' || c === 'accessory' || c === 'offline') return 'accessories';
  return c;
}

function makeOrderId() {
  return 'LOCAL-' + Date.now();
}

export async function onRequestPost({ request, env }) {
  try {
    const db   = env.DB;
    const body = await request.json();

    if (body.order && body.items) {
      const o        = body.order;
      const order_id = (o.order_id || o.id || '').toString().trim() || makeOrderId();
      const is_combo = body.items.length > 1 || o.is_combo ? 1 : 0;

      let combo_price = parseFloat(o.combo_price || o.price || 0);
      if (!combo_price && is_combo) {
        combo_price = body.items.reduce((s, i) => s + parseFloat(i.price || 0), 0);
      }

      await db.prepare(
        `INSERT OR IGNORE INTO orders (order_id, date, vendor, is_combo, combo_price, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        order_id,
        o.date || new Date().toISOString().slice(0, 10),
        o.vendor || '',
        is_combo,
        combo_price,
        o.notes || ''
      ).run();

      for (const item of body.items) {
        await db.prepare(
          `INSERT INTO logs
            (order_id, date, category, vendor, name, price, notes, roaster, size, coffee_type, brew_equip, qty)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          order_id,
          o.date || new Date().toISOString().slice(0, 10),
          normalizeCategory(item.category),
          item.vendor || o.vendor || '',
          item.name || '',
          parseFloat(item.price || 0),
          item.notes || '',
          item.roaster || '',
          item.size || '',
          item.coffee_type || item.coffeeType || '',
          Array.isArray(item.brew_equip) ? item.brew_equip.join(',') : (item.brew_equip || item.brewEquip || ''),
          parseInt(item.qty || 1)
        ).run();
      }

      return Response.json({ ok: true }, { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    const { action } = body;

    if (action === "addOrder") {
      const { order_id, date, vendor, is_combo, combo_price, notes } = body;
      await db.prepare(
        "INSERT OR IGNORE INTO orders (order_id, date, vendor, is_combo, combo_price, notes) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(order_id, date, vendor, is_combo ? 1 : 0, combo_price || 0, notes || "").run();
      return Response.json({ ok: true });
    }

    if (action === "addLog") {
      const { order_id, date, category, vendor, name, price, notes, roaster, size, coffee_type, brew_equip, qty } = body;
      await db.prepare(
        `INSERT INTO logs (order_id, date, category, vendor, name, price, notes, roaster, size, coffee_type, brew_equip, qty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        order_id, date, normalizeCategory(category), vendor, name,
        price || 0, notes || "", roaster || "", size || "",
        coffee_type || "", brew_equip || "", qty || 1
      ).run();
      return Response.json({ ok: true });
    }

    if (action === "deleteLog") {
      const { id } = body;
      await db.prepare("DELETE FROM logs WHERE id = ?").bind(id).run();
      await db.prepare(
        "DELETE FROM orders WHERE order_id NOT IN (SELECT DISTINCT order_id FROM logs)"
      ).run();
      return Response.json({ ok: true });
    }

    if (action === "updateLog") {
      const { id, date, category, vendor, name, price, notes, roaster, size, coffee_type, brew_equip, qty } = body;
      await db.prepare(
        `UPDATE logs SET date=?, category=?, vendor=?, name=?, price=?,
          notes=?, roaster=?, size=?, coffee_type=?, brew_equip=?, qty=?,
          updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(
        date, normalizeCategory(category), vendor, name, price || 0,
        notes || "", roaster || "", size || "",
        coffee_type || "", brew_equip || "", qty || 1, id
      ).run();
      return Response.json({ ok: true });
    }

    if (action === "updateOrder") {
      const { order_id, date, vendor, is_combo, combo_price, notes } = body;
      await db.prepare(
        "UPDATE orders SET date=?, vendor=?, is_combo=?, combo_price=?, notes=? WHERE order_id=?"
      ).bind(date, vendor, is_combo ? 1 : 0, combo_price || 0, notes || "", order_id).run();
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const db   = env.DB;
    const body = await request.json();

    if (body.id) {
      await db.prepare(
        `UPDATE logs SET
          date=?, category=?, vendor=?, name=?, price=?,
          notes=?, roaster=?, size=?, coffee_type=?, brew_equip=?, qty=?,
          updated_at=CURRENT_TIMESTAMP
         WHERE id=?`
      ).bind(
        body.date,
        normalizeCategory(body.category),
        body.vendor || '',
        body.name || '',
        parseFloat(body.price || 0),
        body.notes || '',
        body.roaster || '',
        body.size || '',
        body.coffee_type || body.coffeeType || '',
        Array.isArray(body.brew_equip) ? body.brew_equip.join(',') : (body.brew_equip || body.brewEquip || ''),
        parseInt(body.qty || 1),
        body.id
      ).run();

      if (body.order_id) {
        await db.prepare(
          "UPDATE orders SET date=?, vendor=? WHERE order_id=?"
        ).bind(body.date, body.vendor || '', body.order_id).run();
      }

      return Response.json({ ok: true }, { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    if (body.order && body.items) {
      const o        = body.order;
      const items    = body.items;
      const order_id = (o.order_id || o.id || '').toString().trim();
      const is_combo = items.length > 1 || o.is_combo ? 1 : 0;

      let combo_price = parseFloat(o.combo_price || o.price || 0);
      if (!combo_price && is_combo) {
        combo_price = items.reduce((s, i) => s + parseFloat(i.price || 0), 0);
      }

      await db.prepare(
        "UPDATE orders SET date=?, vendor=?, is_combo=?, combo_price=?, notes=? WHERE order_id=?"
      ).bind(o.date, o.vendor || '', is_combo, combo_price, o.notes || '', order_id).run();

      await db.prepare("DELETE FROM logs WHERE order_id=?").bind(order_id).run();

      for (const item of items) {
        await db.prepare(
          `INSERT INTO logs
            (order_id, date, category, vendor, name, price, notes, roaster, size, coffee_type, brew_equip, qty)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          order_id, o.date,
          normalizeCategory(item.category),
          item.vendor || o.vendor || '',
          item.name || '',
          parseFloat(item.price || 0),
          item.notes || '',
          item.roaster || '',
          item.size || '',
          item.coffee_type || item.coffeeType || '',
          Array.isArray(item.brew_equip) ? item.brew_equip.join(',') : (item.brew_equip || item.brewEquip || ''),
          parseInt(item.qty || 1)
        ).run();
      }

      return Response.json({ ok: true }, { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    return Response.json({ error: "Invalid PUT body" }, { status: 400 });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const db   = env.DB;
    const body = await request.json();
    const { id, order_id } = body;

    if (id) {
      await db.prepare("DELETE FROM logs WHERE id=?").bind(id).run();
    }
    if (order_id) {
      await db.prepare("DELETE FROM logs WHERE order_id=?").bind(order_id).run();
      await db.prepare("DELETE FROM orders WHERE order_id=?").bind(order_id).run();
    }

    await db.prepare(
      "DELETE FROM orders WHERE order_id NOT IN (SELECT DISTINCT order_id FROM logs)"
    ).run();

    return Response.json({ ok: true }, { headers: { "Access-Control-Allow-Origin": "*" } });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
