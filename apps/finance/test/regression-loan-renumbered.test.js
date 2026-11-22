'use strict';
/**
 * Regression 22.11.2026: PSD BauGeld gave five loans new account numbers in 10/2025. The sheet still had the old ones,
 * so every rate since then counted as "no loan found" (76 payments) and the loans showed no payment after 09/2025.
 * A renumbered account (loan_aliases) counts for the loan: its payments and its statements.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-renumbered-'));
const { getDb } = require('../lib/db');
const db = getDb();
const loans = require('../lib/loans');
const statements = require('../lib/loan-statements');
const OLD = 'DE00120300000111111110'; const NEW = 'DE00120300000222222220';
let n = 0;
const pay = (on, iban, interest, principal) => db.prepare("INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, hash, created_at) VALUES ('Giro', ?, ?, ?, 'Bank', ?, 'x')")
  .run(on, -(interest + principal), `Teilzahlung Darlehen IBAN ${iban}RECHN.ZINS ${(interest / 100).toFixed(2).replace('.', ',')} TILG./ENTG. ${(principal / 100).toFixed(2).replace('.', ',')} TILGUNG PER ${on}`, `p${n += 1}`);

test('payments and statements of the new account number count for the loan once the alias is known', () => {
  loans.importSheet({ asOf: '2026-11-15', units: [{ address: '10000, Musterstadt, Musterweg 1', unit: 'WE 01', market_value: 300000, loans: [{ position: 1, amount: 100000, balance: 60000, annuity: 240, lender: 'PSD', account: OLD }] }] });
  pay('2025-09-01', OLD, 10000, 14000); pay('2025-10-01', NEW, 9900, 14100); pay('2025-11-01', NEW, 9800, 14200);
  db.prepare("INSERT INTO loan_balances (ref, balance_on, balance_cents) VALUES ('111111110', '2024-12-31', 6100000), ('222222220', '2025-12-31', 5800000)").run();
  let o = loans.overview();
  assert.equal(o.unmatched, 2, 'without the alias the new number is unknown');
  db.prepare("INSERT INTO loan_aliases (alias, ref) VALUES ('222222220', '111111110')").run();
  o = loans.overview(); const l = o.loans[0];
  assert.equal(o.unmatched, 0);
  assert.equal(l.years['2025'].n, 3); assert.equal(l.last_paid, '2025-11-01');
  assert.deepEqual(statements.of('111111110').history.map((h) => `${h.on}=${h.cents}`), ['2024-12-31=6100000', '2025-12-31=5800000']);
  assert.equal(l.balance_now_cents, 5800000, 'the newest statement (new number) is the balance');
});
