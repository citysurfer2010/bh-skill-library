#!/usr/bin/env node
'use strict';
/**
 * Takes over the bank's loan statements. Reads JSON from stdin: { statements: [{ name, text }], docs: [{ ref, url }] }
 * (text = the PDF's text). Only statements of loans from the portfolio sheet are kept. Data stays on the server.
 *   node scripts/import-loan-statements.js < statements.json
 */
const { getDb, closeDb } = require('../lib/db');
const { accountNo } = require('../lib/loans');
const statements = require('../lib/loan-statements');

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  const refs = new Set(getDb().prepare("SELECT account_iban FROM loans WHERE account_iban != ''").all().map((l) => accountNo(l.account_iban)).filter(Boolean));
  const r = statements.importStatements(JSON.parse(input), refs);
  console.log(`Darlehensauszüge übernommen: ${r.balances} Kontostände, ${r.skipped} Dateien ohne passendes Darlehen`);
  closeDb();
});
