'use strict';
/** Loans: sheet import replaces all, bank lines are matched by IBAN or account number and split into interest and repayment. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-loans-'));
const { getDb } = require('../lib/db');
const loans = require('../lib/loans');
const db = getDb(); let n = 0;
const IBAN_A = 'DE00123456780001234567'; const IBAN_B = 'DE00987654320009876543'; // made up
const add = (day, cents, text) => db.prepare('INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('Testkonto', day, cents, text, 'Bank', `l${n += 1}`, 'x');

test('parse: BBBank split with IBAN, PSD with account number, rate without split, anything else null', () => {
  assert.deepEqual(loans.parse(`Teilzahlung Darlehen IBAN ${IBAN_A}RECHN.ZINS          123,45  TILG./ENTG.        1.678,90  TILGUNG PER 30.09.2026`), { refs: [IBAN_A, '1234567'], interest: 12345, principal: 167890 });
  assert.deepEqual(loans.parse('Rechnung Darl.-Leistung 0009876543 Tilgung 300,00 Zinsen 45,10'), { refs: ['9876543'], interest: 4510, principal: 30000 });
  assert.equal(loans.parse('Darlehensrate 123456789012 EREF: x').rateOnly, true);
  assert.equal(loans.parse('REWE Markt'), null);
  assert.equal(loans.accountNo(IBAN_B), '9876543');
});

test('import replaces all loans; overview sums, matches payments per year and masks the IBAN', () => {
  const sheet = (amount) => ({ asOf: '2026-11-15', units: [
    { address: '10000, Musterstadt, Musterweg 1', unit: 'WE 01', owner: 'A', sqm: 60.5, rent_year: 12000, market_value: 300000, loans: [{ position: 1, amount, balance: 150000, annuity: 900, ends_on: '2027-05-30', lender: 'Bank A', account: IBAN_A }, { position: 2, amount: null, balance: null }] },
    { address: '20000, Beispielort, Beispielstraße 2', unit: 'WE 02', market_value: 200000, loans: [{ position: 1, amount: 100000, balance: 80000, annuity: 500, ends_on: '2035-01-01', lender: 'Bank B', account: IBAN_B }] },
  ] });
  loans.importSheet(sheet(1));
  assert.deepEqual(loans.importSheet(sheet(200000)), { units: 2, loans: 2 }, 'empty loan slots are skipped, a new import replaces the old one');
  add('2025-03-31', -180235, `Teilzahlung Darlehen IBAN ${IBAN_A}RECHN.ZINS 123,45 TILG./ENTG. 1.678,90 TILGUNG PER 31.03.2025`);
  add('2026-03-31', -180235, `Teilzahlung Darlehen IBAN ${IBAN_A}RECHN.ZINS 100,00 TILG./ENTG. 1.702,35 TILGUNG PER 31.03.2026`);
  add('2026-04-01', -34510, 'Rechnung Darl.-Leistung 0009876543 Tilgung 300,00 Zinsen 45,10');
  add('2026-04-02', -50000, 'Rechnung Darl.-Leistung 5555555555 Tilgung 400,00 Zinsen 100,00');
  add('2026-04-03', 34510, 'Rechnung Darl.-Leistung 0009876543 Tilgung 300,00 Zinsen 45,10'); // money in: no rate
  const o = loans.overview();
  assert.equal(o.loans.length, 2); assert.equal(o.asOf, '2026-11-15');
  assert.deepEqual(o.totals, { amount: 30000000, balance: 23000000, annuity: 140000, marketValue: 50000000 });
  const a = o.loans.find((l) => l.lender === 'Bank A');
  assert.deepEqual(a.years['2026'], { interest: 10000, principal: 170235, paid: 180235, n: 1 });
  assert.equal(a.iban, '…4567'); assert.ok(!JSON.stringify(o).includes(IBAN_A), 'full IBAN never leaves the server');
  assert.equal(a.last_paid, '2026-03-31');
  assert.equal(o.loans.find((l) => l.lender === 'Bank B').years['2026'].interest, 4510);
  assert.equal(o.unmatched, 1, 'a payment for a loan not in the sheet is counted, not guessed');
  assert.deepEqual(o.years.map((y) => y.year), [2026, 2025]);
});

test('estate: flats with value, rent and the balance of their loans; a flat without loans counts as free of debt', () => {
  const e = loans.estate();
  assert.equal(e.units.length, 2);
  const a = e.units.find((u) => u.unit === 'WE 01');
  assert.equal(a.sqm, 60.5); assert.equal(a.rent_year_cents, 1200000); assert.equal(a.balance_cents, 15000000); assert.equal(a.loans, 1);
  assert.deepEqual(e.totals, { units: 2, sqm: 60.5, marketValue: 50000000, rentYear: 1200000, balance: 23000000 });
  loans.importSheet({ units: [{ address: '1, X, Y 1', unit: 'WE 9', market_value: 1000, loans: [] }] });
  assert.equal(loans.estate().units[0].balance_cents, null);
});

