'use strict';
/** Loan statements: balances and rate read from the bank's statement text; today's balance = last statement − repayment since. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-stmt-'));
const { getDb } = require('../lib/db');
const loans = require('../lib/loans');
const st = require('../lib/loan-statements');
const IBAN = 'DE00123456780001234567'; // made up, account number 1234567
const text = (from, to, rate = '2,15000') => `EUR-Konto       Kontonummer 0001234567
Kontoauszug    Nr.  2/2024
alter Kontostand vom ${from[0]}      ${from[1]} S
31.07. 31.07. Darlehen PN:100     310,00 H
${rate}% Sollzins       3107      108,20S
neuer Kontostand vom ${to[0]}      ${to[1]} S`;

test('parse: account, both balances as debt, rate; other papers give null', () => {
  assert.deepEqual(st.parse(text(['28.06.2024', '61.234,50'], ['30.12.2024', '60.111,20'])), { ref: '1234567', balances: [{ on: '2024-06-28', cents: 6123450 }, { on: '2024-12-30', cents: 6011120 }], rate: 2.15 });
  assert.equal(st.parse('Zinsbescheinigung für 2024'), null);
});

test('import keeps only known loans; overview: balance today from the last statement minus repayment since', () => {
  loans.importSheet({ asOf: '2026-11-15', units: [{ address: '1, Musterstadt, Musterweg 1', unit: 'WE 01', market_value: 200000, loans: [{ position: 1, amount: 120000, balance: 99999, annuity: 310, lender: 'Bank', account: IBAN }] }] });
  const refs = new Set(['1234567']);
  const r = st.importStatements({ statements: [
    { name: 'a.pdf', text: text(['29.12.2023', '62.345,60'], ['28.06.2024', '61.234,50']) },
    { name: 'b.pdf', text: text(['28.06.2024', '61.234,50'], ['30.12.2024', '60.111,20']) },
    { name: 'other.pdf', text: text(['01.01.2024', '1,00'], ['30.06.2024', '2,00']).replace('0001234567', '0009999999') },
  ], docs: [{ ref: '1234567', url: 'https://drive.google.com/drive/folders/x' }, { ref: '1234567', url: 'javascript:alert(1)' }] }, refs);
  assert.deepEqual(r, { balances: 4, skipped: 1 }, 'the shared middle balance is stored once and updated, a foreign account is skipped');
  const db = getDb(); let n = 0;
  const pay = (day, z, ti) => db.prepare('INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('BBB', day, -31000, `Teilzahlung Darlehen IBAN ${IBAN}RECHN.ZINS ${z} TILG./ENTG. ${ti} TILGUNG PER ${day}`, 'Bank', `s${n += 1}`, 'x');
  pay('2024-12-30', '109,00', '201,00'); // already in the statement balance
  pay('2025-01-31', '108,60', '201,40');
  pay('2025-02-28', '108,20', '201,80');
  const l = loans.overview().loans[0];
  assert.equal(l.rate_pct, 2.15); assert.equal(l.docs_url, 'https://drive.google.com/drive/folders/x', 'only drive links are kept');
  assert.deepEqual(l.bank_balance, { on: '2024-12-30', cents: 6011120 });
  assert.equal(l.balance_now_cents, 6011120 - 20140 - 20180);
  assert.equal(l.history.length, 3);
  assert.equal(loans.overview().totals.balance, l.balance_now_cents, 'totals use today\'s balance');
  assert.equal(loans.estate().units[0].balance_cents, l.balance_now_cents, 'the Immobilien module shows the same balance');
});
