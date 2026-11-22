'use strict';
/** Running year (Matti 22.11.2026): compared with the same span of the year before, averages over the months passed. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-period-'));
const { getDb } = require('../lib/db');
const report = require('../lib/report');
const db = getDb(); let n = 0;
db.prepare("INSERT INTO categories (code, art, name) VALUES ('LEBEN', 'Ausgaben', 'Lebensmittel')").run();
const add = (day, cents) => db.prepare("INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, category, hash, created_at) VALUES ('Giro', ?, ?, 't', 'Markt', 'LEBEN', ?, 'x')").run(day, cents, `p${n += 1}`);
add('2025-02-10', -1000); add('2025-03-15', -2000); add('2025-03-16', -4000); add('2025-11-30', -8000); add('2026-01-05', -500);

test('running year: previous year only up to the same day, average over the months passed', () => {
  const o = report.overview(2026, new Date('2026-03-15T10:00:00Z'));
  assert.equal(o.elapsed, 3); assert.equal(o.previousUntil, '2025-03-16');
  assert.equal(o.categories.find((c) => c.code === 'LEBEN').previous, -3000, 'Feb 10 and Mar 15, not Mar 16 or later');
});

test('a past year compares whole years', () => {
  const o = report.overview(2025, new Date('2026-03-15T10:00:00Z'));
  assert.equal(o.elapsed, 12); assert.equal(o.previousUntil, null);
  assert.equal(o.categories.find((c) => c.code === 'LEBEN').total, -15000);
});
