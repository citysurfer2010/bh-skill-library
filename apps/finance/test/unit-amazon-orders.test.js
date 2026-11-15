'use strict';
/** Amazon page: orders with items and their bank lines; filters by year, text, category and with/without bank line. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-amzo-'));
const { getDb } = require('../lib/db');
const amazon = require('../lib/amazon');
const orders = require('../lib/amazon-orders');
const db = getDb();
db.prepare("INSERT INTO categories (code, art, name) VALUES ('KLEID_K', 'Ausgaben', 'Kleidung Kinder'), ('BÜRO', 'Ausgaben', 'Bürobedarf')").run();
amazon.storeOrders([
  { id: '302-0000001-0000001', date: '2026-03-02', totalCents: 2398, items: [{ asin: 'B0A', title: 'Regenjacke Kinder', url: 'https://www.amazon.de/dp/B0A' }] },
  { id: '302-0000002-0000002', date: '2025-07-10', totalCents: 1599, items: [{ asin: 'B0B', title: 'Druckerpapier A4', url: 'https://www.amazon.de/dp/B0B' }] },
  { id: '302-0000003-0000003', date: '2026-01-05', totalCents: 999, items: [] },
]);
db.prepare("INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, category, amazon_order, hash, created_at) VALUES ('Giro', '2026-03-04', -2398, 'AMZN 302-0000001-0000001', 'AMAZON', 'KLEID_K', '302-0000001-0000001', 'a1', 'x'), ('Giro', '2025-07-12', -1599, 'AMZN', 'AMAZON', NULL, '302-0000002-0000002', 'a2', 'x'), ('Giro', '2026-02-01', -500, 'AMZN 028-1111111-1111111', 'AMAZON', 'BÜRO', '028-1111111-1111111', 'a3', 'x')").run();

test('every order with items and bank lines; an order known only from a bank line is listed too', () => {
  const r = orders.list();
  assert.deepEqual(r.years, ['2026', '2025']);
  assert.equal(r.orders.length, 4);
  const jacket = r.orders.find((o) => o.id === '302-0000001-0000001');
  assert.equal(jacket.items[0].title, 'Regenjacke Kinder'); assert.equal(jacket.paid_cents, -2398); assert.equal(jacket.transactions[0].category_name, 'Kleidung Kinder');
  assert.equal(r.orders.find((o) => o.id === '028-1111111-1111111').day, '2026-02-01', 'date from the bank line');
  assert.deepEqual(r.totals, { orders: 4, items: 2, paid: -4497, withoutLine: 1 });
});

test('filters: year, text in items, category incl. open, with/without bank line', () => {
  assert.equal(orders.list({ year: '2025' }).orders.length, 1);
  assert.deepEqual(orders.list({ q: 'jacke' }).orders.map((o) => o.id), ['302-0000001-0000001']);
  assert.deepEqual(orders.list({ category: 'OFFEN' }).orders.map((o) => o.id), ['302-0000002-0000002']);
  assert.deepEqual(orders.list({ category: 'BÜRO' }).orders.map((o) => o.id), ['028-1111111-1111111']);
  assert.deepEqual(orders.list({ link: 'ohne' }).orders.map((o) => o.id), ['302-0000003-0000003']);
  assert.equal(orders.list({ link: 'mit' }).orders.length, 3);
});
