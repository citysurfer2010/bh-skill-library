'use strict';
/**
 * Amazon orders with their items and the bank lines they were paid with (Matti 15.11.2026: "wo sehe ich die Amazon
 * Transaktionen?"). An order is known from the order history or from a bank line that carries its number.
 */
const { getDb } = require('./db');

/** Orders of a year ("all" for every year), optionally only those matching a text, a category or with/without a bank line. */
function list({ year = 'all', q = '', category = '', link = '' } = {}) {
  const db = getDb();
  const orders = db.prepare(`SELECT o.order_id AS id, o.ordered_on, o.total_cents FROM amazon_orders o
    UNION SELECT t.amazon_order, NULL, NULL FROM transactions t WHERE t.amazon_order IS NOT NULL AND t.amazon_order NOT IN (SELECT order_id FROM amazon_orders)`).all();
  const items = new Map(); for (const i of db.prepare('SELECT order_id, title, url FROM amazon_items ORDER BY title').all()) items.set(i.order_id, [...(items.get(i.order_id) || []), { title: i.title, url: i.url }]);
  const lines = new Map();
  for (const t of db.prepare('SELECT t.id, t.amazon_order, t.booked_on, t.amount_cents, t.account, t.category, c.name AS category_name FROM transactions t LEFT JOIN categories c ON c.code = t.category WHERE t.amazon_order IS NOT NULL ORDER BY t.booked_on').all()) {
    lines.set(t.amazon_order, [...(lines.get(t.amazon_order) || []), { id: t.id, booked_on: t.booked_on, amount_cents: t.amount_cents, account: t.account, category: t.category, category_name: t.category_name }]);
  }
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  const all = orders.map((o) => {
    const tx = lines.get(o.id) || []; const day = o.ordered_on || tx[0]?.booked_on || null;
    return { ...o, day, items: items.get(o.id) || [], transactions: tx, paid_cents: tx.length ? tx.reduce((s, t) => s + t.amount_cents, 0) : null };
  });
  const years = [...new Set(all.map((o) => o.day?.slice(0, 4)).filter(Boolean))].sort().reverse();
  const shown = all.filter((o) => (year === 'all' || o.day?.startsWith(String(year)))
    && (!category || (category === 'OFFEN' ? o.transactions.some((t) => !t.category) : o.transactions.some((t) => t.category === category)))
    && (!link || (link === 'mit' ? o.transactions.length > 0 : o.transactions.length === 0))
    && words.every((w) => `${o.id} ${o.items.map((i) => i.title).join(' ')}`.toLowerCase().includes(w)))
    .sort((a, b) => String(b.day || '').localeCompare(String(a.day || '')));
  return {
    years, orders: shown,
    totals: { orders: shown.length, items: shown.reduce((s, o) => s + o.items.length, 0), paid: shown.reduce((s, o) => s + (o.paid_cents || 0), 0), withoutLine: shown.filter((o) => !o.transactions.length).length },
  };
}

module.exports = { list };
