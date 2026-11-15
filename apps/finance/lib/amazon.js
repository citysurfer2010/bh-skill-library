'use strict';
/**
 * Amazon purchases next to the bank lines: payments from "Ihre Zahlungen" and the items of each order.
 * A bank line gets its order number from its own text (most Amazon debits carry it); otherwise a payment of the same
 * amount within 4 days is taken, only for Amazon lines and only when exactly one fits.
 */
const { getDb } = require('./db');
const api = require('./amazon-api');

const ORDER = /\b(\d{3}-\d{7}-\d{7})\b/;
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
    for (const r of db.prepare("SELECT id, text FROM transactions WHERE amazon_order IS NULL AND text GLOB '*[0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9][0-9]-*'").all()) {
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
  return { byText, byAmount };
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
  for (const [orderId, items] of Object.entries(map)) { for (const i of items) n += ins.run(orderId, i.asin, i.title, i.url).changes; seen.run(orderId, now()); }
  return n;
}

let running = null;
/** Payments since the last fetch (with overlap), then items for orders without them, newest first. */
function sync({ force = false } = {}) {
  if (running) return running;
  running = (async () => {
    const last = state('amazon_last_sync');
    if (!force && last && Date.now() - Date.parse(last) < MIN_GAP_MS) return { skipped: true };
    try {
      const lastPaid = getDb().prepare('SELECT max(paid_on) AS d FROM amazon_payments').get().d;
      const { payments } = await api.payments(lastPaid ? shift(lastPaid, -OVERLAP_DAYS) : FIRST_FROM);
      const added = storePayments(payments);
      const need = getDb().prepare('SELECT order_id FROM amazon_payments WHERE order_id NOT IN (SELECT order_id FROM amazon_orders_seen) GROUP BY order_id ORDER BY max(paid_on) DESC LIMIT 60').all().map((r) => r.order_id);
      // Every order asked for counts as done, also when Amazon shows no items for it (e.g. a gift card), so it is not asked again daily.
      const items = need.length ? storeItems({ ...Object.fromEntries(need.map((id) => [id, []])), ...(await api.items(need)) }) : 0;
      const linked = link();
      state('amazon_last_sync', now()); state('amazon_last_error', '');
      return { payments: payments.length, added, items, linked };
    } catch (e) {
      const plain = e.code === 'login' ? 'login' : /timeout|aborted/i.test(e.message) ? 'Amazon hat zu lange gebraucht, morgen geht es weiter.' : /captcha/i.test(e.message) ? 'Amazon verlangt eine Sicherheitsabfrage. Bitte neu verbinden.' : e.status === 502 ? 'Amazon-Dienst nicht erreichbar.' : String(e.message).slice(0, 200);
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
    lastSync: state('amazon_last_sync') || null, lastError: state('amazon_last_error') || null,
    payments: one('SELECT count(*) AS n FROM amazon_payments'), orders: one('SELECT count(DISTINCT order_id) AS n FROM amazon_payments'),
    withItems: one('SELECT count(DISTINCT order_id) AS n FROM amazon_items'), linked: one('SELECT count(*) AS n FROM transactions WHERE amazon_order IS NOT NULL'),
    first: db.prepare('SELECT min(paid_on) AS d FROM amazon_payments').get().d,
  };
}

/** Items of one order for a transaction's detail. */
const itemsOf = (orderId) => (orderId ? getDb().prepare('SELECT asin, title, url FROM amazon_items WHERE order_id = ? ORDER BY title').all(orderId).map((r) => ({ ...r })) : []);

module.exports = { link, sync, status, itemsOf, storePayments, storeItems, MIN_GAP_MS };
