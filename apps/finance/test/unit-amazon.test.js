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

test('sync: overlap after earlier payments (first ever from 2021), items for new orders, then overlap; key sent; 20 h rule; status counts', async () => {
  reply = (url) => (url.endsWith('/payments') ? { payments: [{ orderId: '302-1234567-7654321', date: '2026-01-04', cents: -2398, method: 'Visa ****1234' }] } : { '302-1234567-7654321': [{ asin: 'B0ABCDEF12', title: 'USB-C Kabel', url: 'https://www.amazon.de/dp/B0ABCDEF12' }] });
  const r = await amazon.sync({ force: true });
  assert.equal(calls[0].body.since, '2025-12-27', 'latest stored payment minus 10 days'); assert.equal(calls[0].auth, 'Bearer k');
  assert.equal(r.added, 1); assert.equal(r.items, 1);
  assert.ok(calls.some((c) => c.url.endsWith('/items') && c.body.orderIds.includes('302-1234567-7654321')));
  assert.deepEqual(amazon.itemsOf('302-1234567-7654321').map((i) => i.title), ['USB-C Kabel']);
  assert.deepEqual(await amazon.sync(), { skipped: true });
  await amazon.sync({ force: true });
  assert.equal(calls.filter((c) => c.url.endsWith('/items')).length, 1, 'orders without items are not asked again');
  const s = amazon.status();
  assert.equal(s.configured, true); assert.equal(s.payments, 4); assert.equal(s.withItems, 1); assert.ok(s.linked >= 2);
});

test('first fetch ever starts in 2021', async () => {
  db.exec('DELETE FROM amazon_payments'); reply = () => ({ payments: [] });
  await amazon.sync({ force: true });
  assert.equal(calls.filter((c) => c.url.endsWith('/payments')).at(-1).body.since, '2021-01-01');
});

test('expired Amazon login is kept as state "login" for the page', async () => {
  reply = () => ({ status: 409, body: { error: 'abgelaufen', code: 'login' } });
  await assert.rejects(amazon.sync({ force: true }), (e) => e.code === 'login');
  assert.equal(amazon.status().lastError, 'login');
});
