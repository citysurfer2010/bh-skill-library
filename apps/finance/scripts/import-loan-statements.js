#!/usr/bin/env node
'use strict';
/**
 * Takes over the bank's loan statements. Reads JSON from stdin: { statements: [{ name, text, folderId }], docs: [{ ref, url }] }
 * (folderId = the flat's Drive folder; run import-estate-links.js first so a loan without account can be found)
 * (text = the PDF's text). Only statements of loans from the portfolio sheet are kept. Data stays on the server.
 *   node scripts/import-loan-statements.js < statements.json
 */
const { getDb, closeDb } = require('../lib/db');
const { accountNo } = require('../lib/loans');
const statements = require('../lib/loan-statements');

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  const db = getDb();
  const refs = new Set(db.prepare("SELECT account_iban FROM loans WHERE account_iban != ''").all().map((l) => accountNo(l.account_iban)).filter(Boolean).concat(db.prepare('SELECT ref FROM loan_refs').all().map((r) => r.ref)));
  const r = statements.importStatements(JSON.parse(input), refs);
  console.log(`Darlehensauszüge übernommen: ${r.balances} Kontostände, ${r.skipped} Dateien ohne passendes Darlehen`);
  closeDb();
});
