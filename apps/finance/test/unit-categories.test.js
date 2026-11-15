'use strict';
/** Categories: add with a derived or own code, edit name/kind/purpose/budget; the code stays, duplicates are refused. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-cat-'));
const { getDb } = require('../lib/db');
const cats = require('../lib/categories');
getDb().prepare("INSERT INTO categories (code, art, name) VALUES ('LEBEN', 'Ausgaben', 'Lebensmittel')").run();
const status = (fn) => { try { fn(); return 0; } catch (e) { return e.status; } };

test('a new category gets its code from the name unless one is given', () => {
  assert.equal(cats.codeFrom('Haustiere & Futter'), 'HAUSTIERE');
  assert.equal(cats.codeFrom('Ärzte'), 'ÄRZTE');
  const c = cats.create({ name: 'Haustiere & Futter', art: 'Ausgaben', description: 'Futter, Tierarzt', budget_cents: 5000 });
  assert.deepEqual({ ...c }, { code: 'HAUSTIERE', art: 'Ausgaben', name: 'Haustiere & Futter', description: 'Futter, Tierarzt', budget_cents: 5000 });
  assert.equal(cats.create({ name: 'Garten', art: 'Ausgaben', code: 'grt' }).code, 'GRT');
});

test('invalid or duplicate input is refused with a clear status', () => {
  assert.equal(status(() => cats.create({ name: '', art: 'Ausgaben' })), 400);
  assert.equal(status(() => cats.create({ name: 'X', art: 'Quatsch' })), 400);
  assert.equal(status(() => cats.create({ name: 'Neu', art: 'Ausgaben', code: 'A' })), 400, 'code too short');
  assert.equal(status(() => cats.create({ name: 'Essen', art: 'Ausgaben', code: 'LEBEN' })), 409, 'code taken');
  assert.equal(status(() => cats.create({ name: 'lebensmittel', art: 'Ausgaben', code: 'LEB2' })), 409, 'name taken, any case');
  assert.equal(status(() => cats.create({ name: 'Y', art: 'Ausgaben', code: 'YY', budget_cents: -1 })), 400);
});

test('editing changes name, kind, purpose and budget but never the code', () => {
  cats.update('LEBEN', { name: 'Essen & Trinken', art: 'Ausgaben', description: 'Supermarkt', budget_cents: 60000 });
  const row = getDb().prepare("SELECT * FROM categories WHERE code = 'LEBEN'").get();
  assert.equal(row.name, 'Essen & Trinken'); assert.equal(row.budget_cents, 60000); assert.equal(row.description, 'Supermarkt');
  cats.update('LEBEN', { budget_cents: null });
  assert.equal(getDb().prepare("SELECT budget_cents FROM categories WHERE code = 'LEBEN'").get().budget_cents, null, 'budget alone, rest kept');
  assert.equal(getDb().prepare("SELECT name FROM categories WHERE code = 'LEBEN'").get().name, 'Essen & Trinken');
  assert.equal(status(() => cats.update('NIX', { name: 'a' })), 404);
  assert.equal(status(() => cats.update('LEBEN', { name: 'Garten' })), 409);
});
