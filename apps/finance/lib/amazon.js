'use strict';
/**
 * Amazon purchases next to the bank lines: payments from "Ihre Zahlungen" and the items of each order.
 * A bank line gets its order number from its own text (most Amazon debits carry it); otherwise a payment of the same
 * amount within 4 days is taken, only for Amazon lines and only when exactly one fits.
 */
const { getDb } = require('./db');
const api = require('./amazon-api');

const ORDER = /\b([0-9D]\d{2}-\d{7}-\d{7})\b/; // physical 302-…, digital D01-…
const FIRST_FROM = '2021-01-01';
const OVERLAP_DAYS = 10;
const MIN_GAP_MS = 20 * 3600_000;
const now = () => new Date().toISOString();
const state = (k, v) => (v === undefined ? getDb().prepare('SELECT value FROM app_state WHERE key = ?').get(k)?.value : getDb().prepare('INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(k, v));
const shift = (d, days) => new Date(Date.parse(`${d}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Order numbers for bank lines: from the text first, then a unique payment of the same amount close by. */
function link() {
  const db = getDb(); let byText = 0; let byAmount = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const set = db.prepare('UPDATE transactions SET amazon_order = ? WHERE id = ?');
    for (const r of db.prepare("SELECT id, text FROM transactions WHERE amazon_order IS NULL AND text GLOB '*[0-9D][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9][0-9]-*'").all()) {
      const id = ORDER.exec(r.text)?.[1]; if (id) byText += set.run(id, r.id).changes;
    }
    const open = db.prepare("SELECT id, booked_on, amount_cents FROM transactions WHERE amazon_order IS NULL AND (lower(text) LIKE '%amazon%' OR lower(counterparty) LIKE '%amazon%' OR text LIKE '%AMZN%')").all();
    const near = db.prepare(`SELECT order_id FROM amazon_payments WHERE amount_cents = ? AND paid_on BETWEEN date(?, '-4 day') AND date(?, '+4 day')
      AND order_id NOT IN (SELECT amazon_order FROM transactions WHERE amazon_order IS NOT NULL AND amount_cents = ?)`);
    for (const t of open) {
      const hits = near.all(t.amount_cents, t.booked_on, t.booked_on, t.amount_cents);
      if (hits.length === 1) byAmount += set.run(hits[0].order_id, t.id).changes;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  pairRefunds();
  return { byText, byAmount };
}

/**
 * A refund belongs to its payment (Matti 22.11.2026: "die Erstattung sollte immer mit der Zahlung verbunden sein"):
 * refunds of an order take the category of its payments when these agree. Returns how many refunds changed.
 */
function pairRefunds() {
  const db = getDb(); let n = 0;
  const pay = db.prepare('SELECT DISTINCT category FROM transactions WHERE amazon_order = ? AND amount_cents < 0 AND category IS NOT NULL');
  const upd = db.prepare("UPDATE transactions SET category = ?, category_source = CASE WHEN category_source = 'manual' THEN 'manual' ELSE 'amazon' END, suggestion = NULL WHERE amazon_order = ? AND amount_cents > 0 AND (category IS NULL OR category != ?)");
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const { o } of db.prepare('SELECT amazon_order AS o FROM transactions WHERE amazon_order IS NOT NULL AND amount_cents > 0 GROUP BY amazon_order').all()) {
      const c = pay.all(o); if (c.length === 1) n += upd.run(c[0].category, o, c[0].category).changes;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return n;
}

function storePayments(list) {
  const ins = getDb().prepare('INSERT OR IGNORE INTO amazon_payments (order_id, paid_on, amount_cents, method, fetched_at) VALUES (?, ?, ?, ?, ?)');
  let added = 0; for (const p of list) added += ins.run(p.orderId, p.date, p.cents, p.method || '', now()).changes;
  return added;
}

function storeItems(map) {
  const db = getDb();
  const ins = db.prepare('INSERT OR REPLACE INTO amazon_items (order_id, asin, title, url) VALUES (?, ?, ?, ?)');
  const seen = db.prepare('INSERT OR REPLACE INTO amazon_orders_seen (order_id, fetched_at) VALUES (?, ?)');
  let n = 0;
  // A fresh list replaces the old one, so items read wrongly before (e.g. recommendations) disappear on the next fetch.
  const clear = db.prepare('DELETE FROM amazon_items WHERE order_id = ?');
  for (const [orderId, items] of Object.entries(map)) {
    if (items.length) clear.run(orderId);
    for (const i of items) n += ins.run(orderId, i.asin, i.title, i.url).changes;
    seen.run(orderId, now());
  }
  return n;
}

/** Orders from the history pages, with their items; each order counts as done for the item lookup. */
function storeOrders(list) {
  const db = getDb(); let added = 0;
  const ins = db.prepare('INSERT INTO amazon_orders (order_id, ordered_on, total_cents, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT (order_id) DO UPDATE SET ordered_on = COALESCE(excluded.ordered_on, ordered_on), total_cents = COALESCE(excluded.total_cents, total_cents), fetched_at = excluded.fetched_at');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const o of list) {
      added += db.prepare('SELECT 1 FROM amazon_orders WHERE order_id = ?').get(o.id) ? 0 : 1;
      ins.run(o.id, o.date || null, o.totalCents ?? null, now());
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  storeItems(Object.fromEntries(list.map((o) => [o.id, (o.items || []).filter((i) => i && i.asin)])));
  return added;
}

/** Past years whose history is stored completely; a broken run continues with the next missing year. */
const doneYears = () => { try { return JSON.parse(state('amazon_history_years') || '[]'); } catch { return []; } };
const firstYear = Number(FIRST_FROM.slice(0, 4));

/**
 * History one year per call, each year stored and linked at once (Matti 15.11.2026: "schreibt er nicht live in die
 * Datenbank?"). Full run: every year not yet complete, newest first. Daily run: this year up to the newest known
 * order, the year before only if that order was not reached.
 */
async function history(progress) {
  const thisYear = new Date().getFullYear(); const done = new Set(doneYears());
  const known = getDb().prepare('SELECT order_id FROM amazon_orders ORDER BY ordered_on DESC LIMIT 30').all().map((r) => r.order_id);
  const complete = known.length && [...Array(thisYear - firstYear).keys()].every((i) => done.has(firstYear + i));
  const years = complete ? [thisYear, thisYear - 1] : [...Array(thisYear - firstYear + 1).keys()].map((i) => thisYear - i).filter((y) => y === thisYear || !done.has(y));
  for (const year of years) {
    const { orders, reachedKnown } = await api.orders(`${year}-01-01`, complete ? known : [], year);
    progress.orders += orders.length; progress.newOrders += storeOrders(orders); link();
    if (year < thisYear && !complete) { done.add(year); state('amazon_history_years', JSON.stringify([...done].sort())); }
    state('amazon_progress', `${year}: ${orders.length} Bestellungen gespeichert`);
    if (complete && reachedKnown) break;
  }
}

let running = null;
/** Payments since the last fetch (with overlap), the order history year by year, then items for orders without them. */
function sync({ force = false } = {}) {
  if (running) return running;
  running = (async () => {
    const last = state('amazon_last_sync');
    if (!force && last && Date.now() - Date.parse(last) < MIN_GAP_MS) return { skipped: true };
    try {
      // Charges (one row per shipment) from the payments page first: quick, and stored before the long history.
      const lastPaid = getDb().prepare('SELECT max(paid_on) AS d FROM amazon_payments').get().d;
      const { payments } = await api.payments(lastPaid ? shift(lastPaid, -OVERLAP_DAYS) : FIRST_FROM);
      const added = storePayments(payments); link();
      const progress = { orders: 0, newOrders: 0 };
      await history(progress);
      // Items for paid orders the history did not cover (rare), and once a week again for orders still without items
      // (22.11.2026: digital orders were marked as read with no items and never tried again).
      const need = getDb().prepare(`SELECT order_id FROM amazon_payments WHERE order_id NOT IN (SELECT order_id FROM amazon_orders_seen) GROUP BY order_id
        UNION SELECT order_id FROM amazon_orders_seen WHERE order_id NOT IN (SELECT order_id FROM amazon_items) AND fetched_at < ? LIMIT 60`).all(new Date(Date.now() - 7 * 86_400_000).toISOString()).map((r) => r.order_id);
      const items = need.length ? storeItems({ ...Object.fromEntries(need.map((id) => [id, []])), ...(await api.items(need)) }) : 0;
      const linked = link();
      state('amazon_last_sync', now()); state('amazon_last_error', '');
      return { orders: progress.orders, newOrders: progress.newOrders, payments: payments.length, added, items, linked };
    } catch (e) {
      const plain = e.code === 'login' ? 'login' : /closed/i.test(e.message) ? 'Der Abruf wurde unterbrochen, beim nächsten Mal geht er weiter.' : /Timeout \d+ms exceeded|timed out|aborted/i.test(e.message) ? 'Amazon hat zu lange gebraucht, morgen geht es weiter.' : /captcha/i.test(e.message) ? 'Amazon verlangt eine Sicherheitsabfrage. Bitte neu verbinden.' : e.status === 502 ? 'Amazon-Dienst nicht erreichbar.' : String(e.message).slice(0, 200);
      state('amazon_last_sync', now()); state('amazon_last_error', plain);
      throw e;
    }
  })().finally(() => { running = null; });
  return running;
}

function status() {
  const db = getDb(); const one = (sql) => db.prepare(sql).get().n;
  return {
    configured: api.configured(), running: !!running,
    lastSync: state('amazon_last_sync') || null, lastError: state('amazon_last_error') || null, progress: state('amazon_progress') || null, yearsDone: doneYears(),
    payments: one('SELECT count(*) AS n FROM amazon_payments'), orders: one('SELECT count(*) AS n FROM amazon_orders'),
    withItems: one('SELECT count(DISTINCT order_id) AS n FROM amazon_items'), linked: one('SELECT count(*) AS n FROM transactions WHERE amazon_order IS NOT NULL'),
    first: db.prepare('SELECT min(d) AS d FROM (SELECT min(ordered_on) AS d FROM amazon_orders UNION ALL SELECT min(paid_on) FROM amazon_payments)').get().d,
  };
}

/** Items of one order for a transaction's detail. */
const itemsOf = (orderId) => (orderId ? getDb().prepare('SELECT asin, title, url FROM amazon_items WHERE order_id = ? ORDER BY title').all(orderId).map((r) => ({ ...r })) : []);

module.exports = { link, pairRefunds, sync, status, itemsOf, storePayments, storeItems, storeOrders, MIN_GAP_MS };
