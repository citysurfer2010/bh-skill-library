'use strict';
/** Own account names are settings in the database (22.11.2026: no account names in the code). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-accnames-'));
const { getDb } = require('../lib/db');
const db = getDb();
const { accountNames } = require('../lib/account-names');
const { namesOf } = require('../lib/bank-names');
const { parseBankFile } = require('../lib/importers');

test('without settings the bank names are used; settings give own names; unknown keys and empty names are ignored', () => {
  assert.deepEqual([namesOf('BBBank').label, namesOf('Comdirect').card], ['BBBank', 'comdirect Kreditkarte']);
  db.prepare("INSERT INTO app_state (key, value) VALUES ('account_names', ?)").run(JSON.stringify({ bbbank: 'Bank Kurz', comdirect_card: 'Karte K', other: 'x', dkb: ' ' }));
  assert.deepEqual([namesOf('BBBank').label, namesOf('Comdirect').card, namesOf('DKB').label], ['Bank Kurz', 'Karte K', 'DKB']);
  assert.equal(accountNames().other, undefined);
  const bb = parseBankFile(Buffer.from('Buchungstag;Valutadatum;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;Buchungstext;Verwendungszweck;Betrag\n05.01.2024;05.01.2024;Arbeitgeber AG;DE00;Lohn/Gehalt;Lohn;3.000,00\n'));
  assert.equal(bb.account, 'Bank Kurz');
});
