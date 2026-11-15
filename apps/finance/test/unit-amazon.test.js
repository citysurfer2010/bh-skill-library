'use strict';
/** Amazon: link bank lines by order number or unique amount, fetch with overlap, the 20 h rule, expired login. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-amz-'));
process.env.DATA_DIR = dir; process.env.AMAZON_TOKEN_FILE = path.join(dir, 'token');
fs.writeFileSync(process.env.AMAZON_TOKEN_FILE, 'k');
const { getDb } = require('../lib/db');
const api = require('../lib/amazon-api');
const amazon = require('../lib/amazon');

const db = getDb(); let n = 0; const calls = []; let reply = () => ({});
api._setFetch(async (url, init) => { calls.push({ url, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.authorization }); const out = await reply(url); return { ok: !out.status, status: out.status || 200, json: async () => out.body || out }; });
const add = (day, cents, text, party = '') => db.prepare('INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('comdirect', day, cents, text, party, `a${n += 1}`, 'x').lastInsertRowid;
const order = (id) => db.prepare('SELECT amazon_order FROM transactions WHERE id = ?').get(id).amazon_order;

test('link: order number from the text, otherwise one payment of the same amount within 4 days', () => {
  const a = add('2026-01-05', -2398, 'AMAZON PAYMENTS EUROPE S.C.A. 302-1234567-7654321 AMZN Mktp DE');
  const b = add('2026-01-07', -1500, 'AMAZON EU S.A R.L. Lastschrift', 'AMAZON EU');
  const c = add('2026-01-07', -999, 'AMAZON Lastschrift', 'AMAZON EU');
  const d = add('2026-01-08', -1500, 'Edeka');
  amazon.storePayments([{ orderId: '028-0000000-0000001', date: '2026-01-05', cents: -1500, method: 'Lastschrift' }, { orderId: '028-0000000-0000002', date: '2026-01-06', cents: -999, method: 'Lastschrift' }, { orderId: '028-0000000-0000003', date: '2026-01-06', cents: -999, method: 'Visa' }]);
  assert.deepEqual(amazon.link(), { byText: 1, byAmount: 1 });
  assert.equal(order(a), '302-1234567-7654321'); assert.equal(order(b), '028-0000000-0000001');
  assert.equal(order(c), null, 'two payments of 9,99 € fit: no guess'); assert.equal(order(d), null, 'not an Amazon line');
});

test('sync: order history first (items from its cards), then recent payments, items only for orders it missed; 20 h rule', async () => {
  reply = (url) => (url.endsWith('/orders') ? { orders: [{ id: '302-1234567-7654321', date: '2026-01-03', totalCents: 2398, items: [{ asin: 'B0ABCDEF12', title: 'USB-C Kabel', url: 'https://www.amazon.de/dp/B0ABCDEF12' }] }] }
    : url.endsWith('/payments') ? { payments: [{ orderId: '302-1234567-7654321', date: '2026-01-04', cents: -2398, method: 'Visa' }, { orderId: 'D01-0000000-0000009', date: '2026-01-05', cents: -499, method: 'Visa' }] }
      : { 'D01-0000000-0000009': [{ asin: 'B0FILM0001', title: 'Film', url: 'https://www.amazon.de/dp/B0FILM0001' }] });
  const r = await amazon.sync({ force: true });
  const ord = calls.find((c) => c.url.endsWith('/orders'));
  assert.equal(ord.body.since, '2021-01-01', 'first run reads all years'); assert.equal(ord.auth, 'Bearer k');
  assert.equal(r.newOrders, 1); assert.equal(r.added, 2);
  const asked = calls.filter((c) => c.url.endsWith('/items')).flatMap((c) => c.body.orderIds);
  assert.ok(asked.includes('D01-0000000-0000009') && !asked.includes('302-1234567-7654321'), 'history items are not fetched again');
  assert.deepEqual(amazon.itemsOf('302-1234567-7654321').map((i) => i.title), ['USB-C Kabel']);
  assert.deepEqual(await amazon.sync(), { skipped: true });
  await amazon.sync({ force: true });
  const second = calls.filter((c) => c.url.endsWith('/orders')).at(-1).body;
  assert.equal(second.since, `${new Date().getFullYear() - 1}-01-01`); assert.ok(second.stopAt.includes('302-1234567-7654321'));
  const s = amazon.status();
  assert.equal(s.orders, 1); assert.ok(s.withItems >= 2); assert.ok(s.linked >= 2);
});

test('first fetch ever starts in 2021', async () => {
  db.exec('DELETE FROM amazon_payments; DELETE FROM amazon_orders'); reply = (url) => (url.endsWith('/orders') ? { orders: [] } : { payments: [] });
  await amazon.sync({ force: true });
  assert.equal(calls.filter((c) => c.url.endsWith('/payments')).at(-1).body.since, '2021-01-01');
});

test('expired Amazon login is kept as state "login" for the page', async () => {
  reply = () => ({ status: 409, body: { error: 'abgelaufen', code: 'login' } });
  await assert.rejects(amazon.sync({ force: true }), (e) => e.code === 'login');
  assert.equal(amazon.status().lastError, 'login');
});

test('a fresh item list for an order replaces the old one (wrongly read recommendations disappear)', () => {
  amazon.storeItems({ '302-9999999-0000001': [{ asin: 'B0REC00001', title: 'Empfehlung', url: 'u' }, { asin: 'B0REC00002', title: 'Empfehlung 2', url: 'u' }] });
  amazon.storeOrders([{ id: '302-9999999-0000001', date: '2025-05-05', totalCents: 100, items: [{ asin: 'B0REAL0001', title: 'Gekauft', url: 'u' }] }]);
  assert.deepEqual(amazon.itemsOf('302-9999999-0000001').map((i) => i.title), ['Gekauft']);
});
