'use strict';
/**
 * Regression 22.11.2026: the private Kindergeld from "Bundesagentur für Arbeit - Familienkasse" taught the rule
 * "bundesagentur fuer arbeit" → Kindergeld; a tenant's rent paid by "Bundesagentur für Arbeit-Service-Haus" on a flat's
 * account was then booked as Kindergeld. A rule books automatically only in an area where the family used that
 * category themselves; elsewhere it stays open with the suggestion.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-rulescope-'));
const { getDb } = require('../lib/db');
const db = getDb();
db.prepare("INSERT INTO categories (code, art, name) VALUES ('KI-GE', 'Einnahmen', 'Kindergeld'), ('IMMOEIN', 'Einnahmen', 'Immobilien')").run();
db.prepare("INSERT INTO accounts (name, scope, updated_at) VALUES ('Wohnung 1', 'immobilien', 'x')").run();
const { importRows, setCategory } = require('../lib/ledger');
const row = (date, cp) => ({ date, cents: 25000, text: `${cp} Zahlung`, counterparty: cp });
const FK = 'Bundesagentur für Arbeit - Familienkasse'; const JC = 'Bundesagentur für Arbeit-Service-Haus';

test('a rule learned on private accounts books private lines, but only suggests on a flat account', () => {
  const first = importRows({ filename: 'a.csv', format: 'x', account: 'Giro', rows: [row('2026-01-10', FK), row('2026-02-10', FK)], user: 't' });
  assert.equal(first.added, 2);
  for (const r of db.prepare('SELECT id FROM transactions').all()) setCategory(r.id, 'KI-GE');
  importRows({ filename: 'b.csv', format: 'x', account: 'Giro', rows: [row('2026-03-10', FK)], user: 't' });
  importRows({ filename: 'c.csv', format: 'x', account: 'Wohnung 1', rows: [row('2026-03-05', JC)], user: 't' });
  const giro = db.prepare("SELECT category, category_source FROM transactions WHERE account = 'Giro' AND booked_on = '2026-03-10'").get();
  assert.deepEqual({ ...giro }, { category: 'KI-GE', category_source: 'rule' });
  const flat = db.prepare("SELECT category, suggestion FROM transactions WHERE account = 'Wohnung 1'").get();
  assert.deepEqual({ ...flat }, { category: null, suggestion: 'KI-GE' });
});

test('booking the rent on the flat account learns a flat rule; the private Kindergeld rule stays sure', () => {
  for (const r of db.prepare("SELECT id FROM transactions WHERE account = 'Wohnung 1'").all()) setCategory(r.id, 'IMMOEIN');
  importRows({ filename: 'd.csv', format: 'x', account: 'Wohnung 1', rows: [row('2026-04-05', JC)], user: 't' });
  importRows({ filename: 'e.csv', format: 'x', account: 'Wohnung 1', rows: [row('2026-05-05', JC)], user: 't' });
  for (const r of db.prepare("SELECT id FROM transactions WHERE account = 'Wohnung 1' AND booked_on = '2026-04-05'").all()) setCategory(r.id, 'IMMOEIN');
  importRows({ filename: 'f.csv', format: 'x', account: 'Wohnung 1', rows: [row('2026-06-05', JC)], user: 't' });
  importRows({ filename: 'g.csv', format: 'x', account: 'Giro', rows: [row('2026-06-10', FK)], user: 't' });
  assert.equal(db.prepare("SELECT category FROM transactions WHERE account = 'Wohnung 1' AND booked_on = '2026-06-05'").get().category, 'IMMOEIN');
  assert.equal(db.prepare("SELECT category FROM transactions WHERE account = 'Giro' AND booked_on = '2026-06-10'").get().category, 'KI-GE');
  assert.deepEqual(db.prepare("SELECT counterparty, category FROM rules ORDER BY counterparty").all().map((r) => `${r.counterparty}=${r.category}`), ['bundesagentur fuer arbeit=KI-GE', 'immobilien:bundesagentur fuer arbeit=IMMOEIN']);
});
