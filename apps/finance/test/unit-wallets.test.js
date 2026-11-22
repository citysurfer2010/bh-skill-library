'use strict';
/**
 * Regression 22.11.2026: PayPal debits and credit card statements were booked as transfers although the PayPal and card
 * lines (the real shops) were no longer on file, so the spending vanished from the overview; and payouts from a property
 * account counted as transfers instead of the flats' surplus.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-wallet-'));
const { getDb } = require('../lib/db');
const wallets = require('../lib/wallets');
const transfers = require('../lib/transfers');
const categorize = require('../lib/categorize');
const db = getDb();
db.prepare("INSERT INTO categories (code, art, name) VALUES ('TRANS', 'Übertrag', 'Geldtransfer'), ('KLEID', 'Ausgaben', 'Kleidung'), ('IMMOEIN', 'Einnahmen', 'Überschuss aus Immobilien'), ('IMMOAUS', 'Ausgaben', 'Ausgaben für Immobilien'), ('AUTO', 'Ausgaben', 'Auto')").run();
let n = 0;
const add = (account, day, cents, text, party, category = null, source = null) => db.prepare('INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, category, category_source, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(account, day, cents, text, party, category, source, `w${n += 1}`, 'x').lastInsertRowid;
const row = (id) => ({ ...db.prepare('SELECT category, category_source, suggestion FROM transactions WHERE id = ?').get(id) });

test('shop from the PayPal text', () => {
  assert.equal(wallets.shopOf('. Musterladen Handels GmbH,; Ihr Einkauf bei Musterladen'), 'Musterladen');
  assert.equal(wallets.shopOf('PayPal Europe S.a.r.l. et Cie S.C.A, . Schuhhaus Muster Lastschrift / Belastung'), 'Schuhhaus Muster');
});

test('PayPal: transfer while the PayPal lines are on file, afterwards the purchase itself', () => {
  add('PayPal', '2025-12-20', -2500, 'Schuhe', 'Schuhhaus Muster');
  categorize.learn('Schuhhaus Muster', 'KLEID'); categorize.learn('Schuhhaus Muster', 'KLEID'); // two signals: sure
  categorize.learn('Shop Unklar', 'KLEID');
  const covered = add('comdirect', '2025-12-21', -2500, 'PayPal Europe S.a.r.l. et Cie S.C.A, . Schuhhaus Muster Lastschrift', 'PayPal Europe S.a.r.l. et Cie S.C.');
  const sure = add('comdirect', '2026-02-03', -3000, 'PayPal Europe S.a.r.l. et Cie S.C.A, . Schuhhaus Muster Lastschrift', 'PayPal Europe S.a.r.l. et Cie S.C.', 'TRANS', 'bulk');
  const unsure = add('comdirect', '2026-02-04', -1500, 'PayPal Europe, Ihr Einkauf bei Shop Unklar', 'PayPal Europe S.a.r.l. et Cie S.C.', 'TRANS', 'bulk');
  const manual = add('comdirect', '2026-02-05', -900, 'PayPal Europe, Ihr Einkauf bei Musterladen', 'PayPal Europe S.a.r.l. et Cie S.C.', 'TRANS', 'manual');
  const card = add('comdirect', '2026-03-01', -40000, 'Summe Monatsabrechnung Visa-Karte', 'Summe Monatsabrechnung Visa-Karte', 'AUTO', 'rule');
  wallets.detect();
  assert.deepEqual(row(covered), { category: 'TRANS', category_source: 'wallet', suggestion: null });
  assert.deepEqual(row(sure), { category: 'KLEID', category_source: 'wallet', suggestion: null });
  assert.deepEqual(row(unsure), { category: null, category_source: null, suggestion: 'KLEID' }, 'one signal only: open with suggestion');
  assert.equal(row(manual).category, 'TRANS', 'a person\'s choice stays');
  assert.equal(row(card).category, null, 'card statement without card lines: open, it is spending');
  const again = wallets.detect(); assert.deepEqual(again, { transfers: 0, booked: 0, open: 0 }, 'a second run changes nothing');
});

test('transfers across areas: payout from a property account is surplus, money into it is spent on the flats', () => {
  db.prepare("INSERT INTO accounts (name, scope, updated_at) VALUES ('WE01', 'immobilien', 'x'), ('Giro', 'haushalt', 'x')").run();
  db.prepare("INSERT INTO bank_sessions (session_id, aspsp, status, created_by, created_at) VALUES ('s', 'DKB', 'active', 'm', 'x')").run();
  db.prepare("INSERT INTO bank_accounts (uid, session_id, aspsp, iban, name, label, created_at) VALUES ('a', 's', 'DKB', 'DE00120300000000000001', 'Erika Muster', 'WE01', 'x'), ('b', 's', 'DKB', 'DE00120300000000000002', 'Erika Muster', 'Giro', 'x')").run();
  const out = add('WE01', '2026-04-01', -80000, 'Auszahlung IMK an DE00120300000000000002', 'Erika Muster');
  const inn = add('Giro', '2026-04-01', 80000, 'Auszahlung IMK von DE00120300000000000001', 'Erika Muster', 'TRANS', 'transfer');
  const back = add('Giro', '2026-05-02', -20000, 'Zuschuss Sanierung DE00120300000000000001', 'Erika Muster');
  transfers.detect();
  assert.equal(row(inn).category, 'IMMOEIN', 'an earlier transfer mark is corrected');
  assert.equal(row(back).category, 'IMMOAUS');
  assert.equal(row(out).category, 'TRANS', 'the property side stays a transfer');
  assert.equal(transfers.sideCategory(() => 'haushalt', new Set(['TRANS']), 'a', 'b', 1), 'TRANS');
});
