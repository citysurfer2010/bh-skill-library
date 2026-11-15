'use strict';
/** Fixed text rules: securities settlements → AKTIEN, depot fees → KONTO; decisions of the person stay. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-text-'));
const { getDb } = require('../lib/db');
const rules = require('../lib/text-rules');
const db = getDb();
db.prepare("INSERT INTO categories (code, art, name) VALUES ('AKTIEN', 'Investment', 'Aktien'), ('KONTO', 'Ausgaben', 'Bankkosten'), ('LEBEN', 'Ausgaben', 'Lebensmittel')").run();
let n = 0;
const add = (text, cents, category = null, source = null) => db.prepare('INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, category, category_source, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('DKB Geschäftskonto', '2026-03-01', cents, text, 'DKB AG', category, source, `t${n += 1}`, 'x').lastInsertRowid;
const cat = (id) => db.prepare('SELECT category FROM transactions WHERE id = ?').get(id).category;

test('securities settlements become AKTIEN, depot fees KONTO, the rest stays open', () => {
  const buy = add('Depot 123456 Wertp.Abrechn. 01.03.2026 WKN LYX00F Gesch.Art KV ISIN LU1234567890', -15000);
  const fee = add('Depot 123456 Depotgebuehren 01.01.2026 bis 31.03.2026', -390);
  const other = add('Überweisung an Steuerberater', -50000);
  const card = add('Entgelt; Visa-Kreditkarte; Zeitraum: 01.01.2026 bis 31.03.2026', -1500);
  const fuel = add('CS TANKSTELLE Karte Nr. 1234 comdirect Visa-Debitkarte Auslandseinsatzentgelt 1,75', -6500);
  const refund = add('Wertp.Abrechn. Verkauf ISIN LU1234567890', 20000);
  const mine = add('Wertp.Abrechn. WKN X', -1000, 'LEBEN', 'manual');
  assert.deepEqual(rules.detect(), { changed: 3 });
  assert.equal(cat(buy), 'AKTIEN'); assert.equal(cat(fee), 'KONTO'); assert.equal(cat(other), null); assert.equal(cat(card), 'KONTO'); assert.equal(cat(fuel), null, 'a card purchase with a fee in its text stays open');
  assert.equal(cat(refund), null, 'a sale is money back, not an investment'); assert.equal(cat(mine), 'LEBEN', 'a manual choice stays');
  assert.deepEqual(rules.detect(), { changed: 0 });
});
