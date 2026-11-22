'use strict';
/**
 * 22.11.2026: "die Erstattung sollte immer mit der Zahlung verbunden sein, und wenn man die Kat ändert soll sich
 * beides ändern". A refund takes its payment's category; changing either changes the other (same Amazon order).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-amz-refund-'));
const { getDb } = require('../lib/db');
const db = getDb();
db.prepare("INSERT INTO categories (code, art, name) VALUES ('KLEID', 'Ausgaben', 'Kleidung'), ('KLEID_K', 'Ausgaben', 'Kleidung Kinder'), ('BÜRO', 'Ausgaben', 'Büro')").run();
const amazon = require('../lib/amazon');
const { setCategory } = require('../lib/ledger');
let n = 0;
const add = (day, cents, category, order) => db.prepare("INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, category, amazon_order, hash, created_at) VALUES ('Giro', ?, ?, 'AMZN Mktp', 'AMAZON PAYMENTS', ?, ?, ?, 'x')").run(day, cents, category, order, `r${n += 1}`).lastInsertRowid;
const cat = (id) => db.prepare('SELECT category FROM transactions WHERE id = ?').get(id).category;

test('a refund gets the category of its payment; mixed payments leave it alone', () => {
  const pay = add('2026-03-01', -5000, 'KLEID', '302-0000001-0000001'); const back = add('2026-03-10', 2000, null, '302-0000001-0000001');
  const p1 = add('2026-04-01', -1000, 'KLEID', '302-0000002-0000002'); add('2026-04-02', -1500, 'BÜRO', '302-0000002-0000002'); const back2 = add('2026-04-09', 1000, null, '302-0000002-0000002');
  assert.equal(amazon.pairRefunds(), 1);
  assert.equal(cat(back), 'KLEID'); assert.equal(cat(back2), null, 'two categories in the order: no guess'); assert.ok(p1);
  assert.equal(cat(pay), 'KLEID');
});

test('changing the category of the payment changes the refund and the other way round', () => {
  const pay = add('2026-05-01', -3000, 'KLEID', '302-0000003-0000003'); const back = add('2026-05-08', 3000, 'KLEID', '302-0000003-0000003');
  setCategory(pay, 'KLEID_K'); assert.equal(cat(back), 'KLEID_K');
  setCategory(back, 'BÜRO'); assert.equal(cat(pay), 'BÜRO');
});
