#!/usr/bin/env node
'use strict';
/**
 * Takes over the flats and their loans from the sheet "Portfolioübersicht – Bankübersicht Finanzierung". Reads JSON from stdin:
 *   { asOf, units: [{ address, unit, floor, owner, sqm, market_value, land_charge, rent_year, note,
 *                     loans: [{ position, amount, balance, annuity, ends_on, lender, account }] }] }
 * Replaces all flats and loans (the sheet is the source). Data stays on the server, never in git.
 *   node scripts/import-portfolio.js < portfolio.json
 */
const { closeDb } = require('../lib/db');
const loans = require('../lib/loans');

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  const r = loans.importSheet(JSON.parse(input));
  console.log(`Kredite übernommen: ${r.units} Wohnungen, ${r.loans} Darlehen`);
  closeDb();
});
