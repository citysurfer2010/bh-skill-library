'use strict';
/** Loan rates (22.11.2026): interest is spending, repayment builds wealth; the booking stays one line. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-split-'));
const { getDb, closeDb } = require('../lib/db');
getDb().prepare("INSERT INTO categories (code, art, name) VALUES ('IMMORATE', 'Ausgaben', 'Immobilienkredite'), ('LEBEN', 'Ausgaben', 'Lebensmittel')").run();
closeDb(); // reopen: the migration adds TILG once IMMORATE exists
const db = getDb();
const split = require('../lib/loan-split');
const report = require('../lib/report');
let n = 0;
const add = (cents, text, category = 'IMMORATE') => db.prepare("INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, category, hash, created_at) VALUES ('Giro', '2026-03-31', ?, ?, 'Bank', ?, ?, 'x')").run(cents, text, category, `s${n += 1}`).lastInsertRowid;
const parts = (id) => Object.fromEntries(db.prepare('SELECT category, cents FROM transaction_splits WHERE transaction_id = ?').all(id).map((r) => [r.category, r.cents]));

test('BBBank and PSD rates are split; interest-only, rates without split text and other categories stay whole', () => {
  assert.equal(db.prepare("SELECT art FROM categories WHERE code = 'TILG'").get().art, 'Investment');
  const bb = add(-30000, 'Teilzahlung Darlehen IBAN DE00123456780001234567RECHN.ZINS 120,00 TILG./ENTG. 180,00 TILGUNG PER 31.03.2026');
  const psd = add(-50000, 'Rechnung Darl.-Leistung 0009876543 Tilgung 400,00 Zinsen 100,00');
  const zins = add(-9000, 'Rechnung Darl.-Leistung 0009876543 Zinsen 90,00');
  const bauspar = add(-26250, '1234 567-89 262,50');
  const other = add(-5000, 'RECHN.ZINS 10,00 TILG./ENTG. 40,00', 'LEBEN');
  const r = split.detect();
  assert.equal(r.split, 2);
  assert.deepEqual(parts(bb), { IMMORATE: -12000, TILG: -18000 });
  assert.deepEqual(parts(psd), { IMMORATE: -10000, TILG: -40000 });
  for (const id of [zins, bauspar, other]) assert.deepEqual(parts(id), {});
});

test('the overview counts interest as spending and repayment as investment; the total stays the same', () => {
  const o = report.overview(2026, new Date('2026-11-22T10:00:00Z'));
  const cat = (c) => o.categories.find((x) => x.code === c)?.total || 0;
  assert.equal(cat('TILG'), -58000);
  assert.equal(cat('IMMORATE'), -12000 - 10000 - 9000 - 26250);
  assert.equal(o.totals.invested, 58000);
  const sum = o.categories.reduce((s, c) => s + c.total, 0);
  assert.equal(sum, db.prepare("SELECT SUM(amount_cents) s FROM transactions").get().s);
  assert.equal(report.investments(2026).total, 58000);
});

test('a rate moved to another category loses its split', () => {
  const id = add(-1000, 'RECHN.ZINS 4,00 TILG./ENTG. 6,00');
  split.detect(); assert.deepEqual(parts(id), { IMMORATE: -400, TILG: -600 });
  db.prepare("UPDATE transactions SET category = 'LEBEN' WHERE id = ?").run(id);
  split.detect(); assert.deepEqual(parts(id), {});
});
