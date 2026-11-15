'use strict';
/** Accounts: scope guess from the bank, only household accounts count, renaming a whole account. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-acc-'));
const { getDb } = require('../lib/db');
const accounts = require('../lib/accounts');
const report = require('../lib/report');

const db = getDb();
db.prepare("INSERT INTO categories (code, art, name) VALUES ('LEBEN', 'Ausgaben', 'Lebensmittel'), ('IMMOEIN', 'Einnahmen', 'Überschuss aus Immobilien')").run();
let n = 0;
const add = (account, day, cents, category) => db.prepare('INSERT INTO transactions (account, booked_on, amount_cents, category, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(account, day, cents, category, `h${n += 1}`, '2026-11-15');

test('scope guess: rent account → Immobilien, deposit trust account → Treuhand, otherwise Haushalt', () => {
  assert.equal(accounts.defaultScope({ product: 'Mietenkonto - privat', details: 'XYZ - BLN, Musterwegstraße 20 - WE01', usage: 'PRIV' }), 'immobilien');
  assert.equal(accounts.defaultScope({ product: 'Treuhandkonto Einzelmietkaution', usage: 'ORGA' }), 'treuhand');
  assert.equal(accounts.defaultScope({ product: 'Girokonto', details: 'Geschäftskonto' }), 'immobilien');
  assert.equal(accounts.defaultScope({ product: 'Girokonto', details: 'Girokonto' }), 'haushalt');
});

test('only household accounts count in the overview; the list shows all with their scope', () => {
  add('comdirect', '2026-03-02', -5000, 'LEBEN');
  add('Musterwegstraße 20 - WE01', '2026-03-03', 90000, 'IMMOEIN');
  accounts.ensure('Musterwegstraße 20 - WE01', 'immobilien');
  accounts.ensure('Musterwegstraße 20 - WE01', 'haushalt'); // never overwrites a scope already set
  const o = report.overview(2026);
  assert.equal(o.totals.income, 0); assert.equal(o.totals.spending, -5000);
  const list = accounts.list();
  assert.deepEqual(list.map((a) => [a.name, a.scope]), [['comdirect', 'haushalt'], ['Musterwegstraße 20 - WE01', 'immobilien']]);
  accounts.setScope('Musterwegstraße 20 - WE01', 'haushalt');
  assert.equal(report.overview(2026).totals.income, 90000);
  assert.throws(() => accounts.setScope('comdirect', 'privat'), /Bereich unbekannt/);
});

test('rename takes lines and scope along; a name in use is refused; unknown account is false', () => {
  accounts.setScope('Musterwegstraße 20 - WE01', 'immobilien');
  assert.ok(accounts.rename('Musterwegstraße 20 - WE01', 'WE01 Musterweg'));
  assert.equal(db.prepare("SELECT count(*) AS n FROM transactions WHERE account = 'WE01 Musterweg'").get().n, 1);
  assert.equal(accounts.list().find((a) => a.name === 'WE01 Musterweg').scope, 'immobilien');
  assert.throws(() => accounts.rename('WE01 Musterweg', 'comdirect'), /gibt es schon/);
  assert.throws(() => accounts.rename('comdirect', ''), /1 bis 60/);
  assert.equal(accounts.rename('gibt es nicht', 'x'), false);
  assert.ok(accounts.rename('comdirect', 'comdirect'));
});

test('a bank account joins an existing account only after a yes (409 code merge first)', () => {
  db.prepare("INSERT INTO bank_sessions (session_id, aspsp, status, created_by, created_at) VALUES ('s-m', 'DKB', 'active', 't', '2026-11-15')").run();
  db.prepare("INSERT INTO bank_accounts (uid, session_id, aspsp, label, created_at) VALUES ('u-m', 's-m', 'DKB', 'DKB 1406', '2026-11-15')").run();
  add('DKB 1406', '2026-04-01', -700, null);
  const calls = []; const mergeBank = (uid, name) => { calls.push([uid, name]); return true; };
  assert.throws(() => accounts.rename('DKB 1406', 'comdirect', { mergeBank }), (e) => e.status === 409 && e.code === 'merge' && /Zusammenführen/.test(e.message));
  assert.equal(calls.length, 0);
  assert.ok(accounts.rename('DKB 1406', 'comdirect', { mergeBank, merge: true }));
  assert.deepEqual(calls, [['u-m', 'comdirect']]);
});

test('totals per kind from bank balances; accounts without a balance are counted apart', () => {
  db.prepare("INSERT INTO bank_sessions (session_id, aspsp, status, created_by, created_at) VALUES ('s9', 'DKB', 'active', 'm', 'x')").run();
  db.prepare("INSERT INTO bank_accounts (uid, session_id, aspsp, iban, name, label, balance_cents, balance_on, created_at) VALUES ('m1', 's9', 'DKB', 'DE1', 'x', 'WE01 Musterweg', 345600, '2026-11-14', 'x'), ('g1', 's9', 'DKB', 'DE2', 'x', 'comdirect', 120000, '2026-11-15', 'x')").run();
  const t = accounts.totals();
  assert.equal(t.haushalt.cents, 120000); assert.equal(t.haushalt.asOf, '2026-11-15');
  assert.equal(t.haushalt.accounts - t.haushalt.withoutBalance, 1, 'one private account has a balance, the others are counted apart');
  assert.deepEqual({ ...t.immobilien }, { cents: 345600, accounts: 1, withoutBalance: 0, asOf: '2026-11-14' });
  assert.equal(t.treuhand.accounts, 0);
  assert.equal(accounts.SCOPES.haushalt, 'Privat');
});
