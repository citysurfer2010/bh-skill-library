'use strict';
/**
 * Regression 15.11.2026: the first full Amazon history ran for an hour in one call and stored nothing until the end,
 * so a break lost everything ("schreibt er nicht live in die Datenbank?"). Now every year is stored at once and
 * the next run starts at the year that broke.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-amz-years-'));
process.env.DATA_DIR = dir; process.env.AMAZON_TOKEN_FILE = path.join(dir, 'token');
fs.writeFileSync(process.env.AMAZON_TOKEN_FILE, 'k');
const { getDb } = require('../lib/db');
const api = require('../lib/amazon-api');
const amazon = require('../lib/amazon');

const Y = new Date().getFullYear(); const asked = []; let breakAt = null;
const orderOf = (year) => ({ id: `302-${year}000-0000001`, date: `${year}-06-01`, totalCents: 100, items: [] });
api._setFetch(async (url, init) => {
  const body = init.body ? JSON.parse(init.body) : {};
  if (url.endsWith('/orders')) {
    asked.push(body.year);
    if (body.year === breakAt) return { ok: false, status: 504, json: async () => ({ error: 'Zeit abgelaufen' }) };
    return { ok: true, status: 200, json: async () => ({ orders: [orderOf(body.year)], reachedKnown: false }) };
  }
  return { ok: true, status: 200, json: async () => (url.endsWith('/payments') ? { payments: [] } : {}) };
});

test('a break in one year keeps the years before; the next run continues there', async () => {
  breakAt = Y - 3;
  await assert.rejects(amazon.sync({ force: true }));
  const stored = getDb().prepare('SELECT count(*) AS n FROM amazon_orders').get().n;
  assert.equal(stored, 3, 'this year and the two before are in the database although the run broke');
  assert.deepEqual(amazon.status().yearsDone, [Y - 2, Y - 1], 'past years are marked complete, the current one never');

  asked.length = 0; breakAt = null;
  await amazon.sync({ force: true });
  assert.deepEqual(asked, [Y].concat(Array.from({ length: Y - 3 - 2020 }, (_, i) => Y - 3 - i)), 'only this year and the missing years are read again');
  assert.equal(getDb().prepare('SELECT count(*) AS n FROM amazon_orders').get().n, Y - 2020);
});
