'use strict';
/**
 * Regression 22.11.2026: digital orders (Prime Video, Prime fee) came from the history with no items (their links were
 * not recognised), were marked as read and never asked for again. Orders still without items are asked for again,
 * at most once a week.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-amz-digital-'));
process.env.DATA_DIR = dir; process.env.AMAZON_TOKEN_FILE = path.join(dir, 'token');
fs.writeFileSync(process.env.AMAZON_TOKEN_FILE, 'k');
const { getDb } = require('../lib/db');
const api = require('../lib/amazon-api');
const amazon = require('../lib/amazon');

const db = getDb(); const calls = [];
api._setFetch(async (url, init) => {
  calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
  const out = url.endsWith('/orders') ? { orders: [] } : url.endsWith('/payments') ? { payments: [] } : { 'D01-1111111-0000001': [{ asin: 'amzn1.dv.gti.00000000-0000-0000-0000-000000000001', title: 'Ein Film', url: 'https://www.amazon.de/gp/video/detail/amzn1.dv.gti.00000000-0000-0000-0000-000000000001' }] };
  return { ok: true, status: 200, json: async () => out };
});

test('an order read without items is asked for again after a week, not before', async () => {
  const old = new Date(Date.now() - 8 * 86_400_000).toISOString(); const fresh = new Date().toISOString();
  db.prepare("INSERT INTO amazon_orders_seen (order_id, fetched_at) VALUES ('D01-1111111-0000001', ?), ('D01-1111111-0000002', ?)").run(old, fresh);
  db.prepare("INSERT INTO app_state (key, value) VALUES ('amazon_history_years', ?)").run(JSON.stringify(Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)));
  await amazon.sync({ force: true });
  const asked = calls.filter((c) => c.url.endsWith('/items')).flatMap((c) => c.body.orderIds);
  assert.deepEqual(asked, ['D01-1111111-0000001'], 'only the one tried more than a week ago');
  assert.deepEqual(amazon.itemsOf('D01-1111111-0000001').map((i) => i.title), ['Ein Film']);
});
