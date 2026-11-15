'use strict';
/** Transfers between own accounts: by own IBAN, by unique named pair; decisions of the person stay; extern in/out. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-tr-'));
const { getDb } = require('../lib/db');
const transfers = require('../lib/transfers');
const report = require('../lib/report');

const db = getDb();
db.prepare("INSERT INTO categories (code, art, name) VALUES ('TRANS', 'Übertrag', 'Geldtransfer'), ('LEBEN', 'Ausgaben', 'Lebensmittel'), ('LOHN', 'Einnahmen', 'Lohn')").run();
db.prepare("INSERT INTO bank_sessions (session_id, aspsp, status, created_by, created_at) VALUES ('s', 'DKB', 'active', 'm', 'x')").run();
db.prepare("INSERT INTO bank_accounts (uid, session_id, aspsp, iban, name, label, created_at) VALUES ('g', 's', 'Comdirect', 'DE11200411110000001400', 'Matti Biskup', 'comdirect', 'x'), ('m', 's', 'DKB', 'DE22120300000000008687', 'Anne-Kathrin Biskup und Matti Biskup', 'WE01', 'x')").run();
let n = 0;
const add = (account, day, cents, text, extra = {}) => db.prepare('INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, category, category_source, counterparty_iban, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  .run(account, day, cents, text, extra.party || '', extra.category || null, extra.source || null, extra.iban || null, `h${n += 1}`, 'x').lastInsertRowid;
const cat = (id) => ({ ...db.prepare('SELECT category, category_source FROM transactions WHERE id = ?').get(id) });

test('own IBAN in the bank field or the text makes a transfer; a manual choice stays', () => {
  const a = add('comdirect', '2026-02-01', -50000, 'Miete Rücklage', { iban: 'DE22120300000000008687' });
  const b = add('BBB', '2026-02-02', -2000, 'Empfänger: Matti Kto/IBAN: DE11 2004 1111 0000 0014 00 Buchungstext: Taschengeld');
  const c = add('comdirect', '2026-02-03', -3000, 'Überweisung DE22120300000000008687', { category: 'LEBEN', source: 'manual' });
  const self = add('comdirect', '2026-02-04', -100, 'Gebühr Konto DE11200411110000001400');
  const r = transfers.detect();
  assert.equal(r.byIban, 2);
  assert.deepEqual(cat(a), { category: 'TRANS', category_source: 'transfer' }); assert.equal(cat(b).category, 'TRANS');
  assert.deepEqual(cat(c), { category: 'LEBEN', category_source: 'manual' }); assert.equal(cat(self).category, null);
});

test('pairs: unique opposite amounts within 3 days and named after a holder; a lone rent of the same size is not touched', () => {
  const out = add('CD-CCM', '2026-03-10', -80000, 'Kartenausgleich Biskup');
  const inn = add('PayPal', '2026-03-11', 80000, 'Bankgutschrift');
  const rentA = add('comdirect', '2026-04-01', -90000, 'Miete Wohnung', { party: 'Hausverwaltung' });
  const rentB = add('WE01', '2026-04-01', 90000, 'Miete WE01', { party: 'Mieter Schulz' });
  assert.equal(transfers.detect().byPair, 2);
  assert.equal(cat(out).category, 'TRANS'); assert.equal(cat(inn).category, 'TRANS');
  assert.equal(cat(rentA).category, null); assert.equal(cat(rentB).category, null);
  assert.deepEqual(transfers.detect(), { byIban: 0, byPair: 0 }, 'running again changes nothing');
});

test('extern in and out leave transfers out', () => {
  add('comdirect', '2026-05-01', 300000, 'Gehalt', { category: 'LOHN', source: 'manual' });
  add('comdirect', '2026-05-02', -4000, 'Edeka', { category: 'LEBEN', source: 'manual' });
  const t = report.overview(2026).totals;
  assert.equal(t.externIn, 300000 + 90000);
  assert.equal(t.externOut, -4000 - 3000 - 100 - 90000);
});
