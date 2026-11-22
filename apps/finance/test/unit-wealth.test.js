'use strict';
/** Vermögen (22.11.2026): flats minus loans plus accounts plus entered assets, per month end. Invented data. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-wealth-'));
const { getDb } = require('../lib/db');
const db = getDb();
const loans = require('../lib/loans');
const wealth = require('../lib/wealth');
let n = 0;
const tx = (account, on, cents) => db.prepare("INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, hash, created_at) VALUES (?, ?, ?, 'x', 'y', ?, 'x')").run(account, on, cents, `w${n += 1}`);
db.prepare("INSERT INTO bank_sessions (session_id, aspsp, status, created_by, created_at) VALUES ('s', 'Bank', 'active', 't', 'x')").run();
const acc = (uid, label, cents, scope) => { db.prepare("INSERT INTO bank_accounts (uid, session_id, aspsp, label, created_at, balance_cents, balance_on) VALUES (?, 's', 'Bank', ?, 'x', ?, '2026-03-15')").run(uid, label, cents); db.prepare('INSERT INTO accounts (name, scope, updated_at) VALUES (?, ?, ?)').run(label, scope, 'x'); };
acc('a', 'Giro', 500000, 'haushalt'); acc('b', 'Wohnung 1', 200000, 'immobilien'); acc('c', 'Kaution', 300000, 'treuhand');
tx('Giro', '2026-01-05', 100000); tx('Giro', '2026-02-10', -50000); tx('Giro', '2026-03-01', 20000);
tx('Wohnung 1', '2026-01-03', 10000); tx('Kaution', '2026-01-02', 300000);
loans.importSheet({ asOf: '2026-03-01', units: [
  { address: '10000, Musterstadt, Musterweg 1', unit: 'WE 01', owned_since: '2020-01-01', market_value: 300000, loans: [{ position: 1, amount: 100000, balance: 90000, annuity: 500, lender: 'Bank A' }] },
  { address: '10000, Musterstadt, Musterweg 2', unit: 'WE 02', owned_since: '2026-02-15', market_value: 100000, loans: [] },
] });

test('debt between statements is interpolated; before the first statement its balance (0 for a loan paid out later)', () => {
  const l = { amount_cents: 1000000, history: [{ on: '2025-05-31', cents: 0 }, { on: '2025-06-01', cents: 1000000 }, { on: '2025-12-31', cents: 900000 }], balance_now_cents: 850000 };
  assert.equal(wealth.debtAt(l, '2025-05-30', '2026-03-31'), 0);
  const io = { amount_cents: 500000, history: [{ on: '2025-12-31', cents: 500000 }], balance_now_cents: 500000 };
  assert.equal(wealth.debtAt(io, '2025-01-31', '2026-03-31'), 500000, 'interest-only loan: its amount before the first statement, not 0');
  assert.equal(wealth.debtAt(l, '2025-12-31', '2026-03-31'), 900000);
  assert.equal(wealth.debtAt(l, '2026-03-31', '2026-03-31'), 850000);
  assert.ok(wealth.debtAt(l, '2025-09-15', '2026-03-31') < 1000000 && wealth.debtAt(l, '2025-09-15', '2026-03-31') > 900000);
  assert.equal(wealth.debtAt({ balance_now_cents: 5000 }, '2020-01-01', '2026-03-31'), 5000, 'no statements: today\'s balance');
  const buy = { amount_cents: 600000, history: [{ on: '2025-01-31', cents: 50000 }, { on: '2025-12-31', cents: 600000 }], balance_now_cents: 590000 };
  const ctx = { ownedSince: '2025-01-01', value: 650000 };
  assert.equal(wealth.debtAt(buy, '2025-06-30', '2026-03-31', ctx), 600000, 'purchase loan paid out in parts: full amount owed from the takeover');
  assert.equal(wealth.debtAt(buy, '2024-12-31', '2026-03-31', ctx), 50000, 'before the takeover: as the statements say');
  assert.equal(wealth.debtAt(buy, '2026-03-31', '2026-03-31', ctx), 590000, 'after the full payout: the statements');
  assert.equal(wealth.debtAt({ ...buy, amount_cents: 250000, history: [{ on: '2025-01-31', cents: 0 }, { on: '2025-12-31', cents: 250000 }] }, '2025-06-30', '2026-03-31', { ...ctx, groupAmount: 650000 }), 250000, 'one of two loans of the same bank for the purchase');
  assert.equal(wealth.debtAt({ amount_cents: 100000, history: [{ on: '2025-05-29', cents: 0 }, { on: '2025-05-30', cents: 100000 }] }, '2025-03-31', '2026-03-31', ctx), 0, 'a small loan is no purchase loan');
});

test('months from the first month all accounts have bookings; accounts back-calculated; trust accounts left out; flats from ownership', () => {
  const d = wealth.overview(new Date('2026-03-15T12:00:00Z'));
  assert.equal(d.start, '2026-01-05');
  assert.deepEqual(d.months.map((m) => m.on), ['2026-01-31', '2026-02-28', '2026-03-15']);
  const [jan, feb, now] = d.months;
  assert.equal(jan.cash_private, 500000 - 20000 + 50000); assert.equal(feb.cash_private, 480000); assert.equal(now.cash_private, 500000);
  assert.equal(jan.cash_property, 200000);
  assert.equal(jan.estate, 30000000); assert.equal(feb.estate, 40000000, 'second flat owned since 15.02.');
  assert.equal(now.debt, 9000000);
  assert.equal(now.net, 40000000 - 9000000 + 500000 + 200000);
});

test('entered assets: the latest value up to the month end counts; same name and day replaces; bad input refused', () => {
  wealth.addAsset({ name: 'Depot', kind: 'Depot', value_cents: 1000000, as_of: '2026-01-15' });
  wealth.addAsset({ name: 'Depot', kind: 'Depot', value_cents: 1200000, as_of: '2026-03-01' });
  wealth.addAsset({ name: 'Depot', kind: 'Depot', value_cents: 1250000, as_of: '2026-03-01' });
  const d = wealth.overview(new Date('2026-03-15T12:00:00Z'));
  assert.deepEqual(d.months.map((m) => m.other), [1000000, 1000000, 1250000]);
  assert.equal(d.assets[0].history.length, 2);
  assert.throws(() => wealth.addAsset({ name: 'X', kind: 'Aktien?', value_cents: 1, as_of: '2026-01-01' }), /Art/);
  assert.throws(() => wealth.addAsset({ name: '', kind: 'Depot', value_cents: 1, as_of: '2026-01-01' }), /Name/);
});

test('asset link: only https, kept for later value points without a link', () => {
  wealth.addAsset({ name: 'Beteiligung Test', kind: 'Beteiligung', value_cents: 100000, as_of: '2026-01-31', url: 'https://portal.example.com/p/1' });
  wealth.addAsset({ name: 'Beteiligung Test', kind: 'Beteiligung', value_cents: 120000, as_of: '2026-02-28' });
  const a = wealth.overview(new Date('2026-03-10T12:00:00Z')).assets.find((x) => x.name === 'Beteiligung Test');
  assert.equal(a.value_cents, 120000); assert.equal(a.url, 'https://portal.example.com/p/1');
  assert.throws(() => wealth.addAsset({ name: 'X', kind: 'Sonstiges', value_cents: 1, as_of: '2026-01-01', url: 'javascript:alert(1)' }), /https/);
});
