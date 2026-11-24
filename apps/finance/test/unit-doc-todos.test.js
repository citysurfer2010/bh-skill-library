'use strict';
/** Unterlagen (24.11.2026): add, tick, edit, delete; invalid input is refused. Invented data. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-todos-'));
const { getDb } = require('../lib/db');
getDb();
const todos = require('../lib/doc-todos');

test('open items first, a tick sets the day, the year filters', () => {
  const a = todos.add({ year: 2030, title: 'Abrechnung Musterweg', unit: 'WE 1', kind: 'Anfordern' });
  todos.add({ year: 2030, title: 'Bescheinigung', kind: 'Scannen' });
  todos.add({ year: 2029, title: 'Altes Jahr' });
  assert.equal(todos.update(a, { done: true }), true);
  const l = todos.list(2030);
  assert.equal(l.items.length, 2); assert.equal(l.open, 1);
  assert.equal(l.items[0].title, 'Bescheinigung'); assert.match(l.items[1].done_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(l.years, [2030, 2029]);
  todos.update(a, { done: false, note: 'nochmal' }); assert.equal(todos.list(2030).open, 2);
});

test('invalid input is refused, delete removes', () => {
  assert.throws(() => todos.add({ year: 2030, title: '' }), /Titel/);
  assert.throws(() => todos.add({ year: 1800, title: 'x' }), /Jahr/);
  assert.throws(() => todos.add({ year: 2030, title: 'x', kind: 'Irgendwas' }), /Art/);
  const id = todos.add({ year: 2030, title: 'weg' }); assert.equal(todos.remove(id), true); assert.equal(todos.remove(id), false);
  assert.equal(todos.update(99999, { done: true }), false);
});

test('tax years: list merges years with documents, total counts only years with a notice, links must be https', () => {
  const tax = require('../lib/tax-years');
  tax.save(2028, { status: 'Bescheid erhalten', refund_cents: 150000, notice_on: '2029-05-01' });
  tax.save(2027, { status: 'eingereicht', refund_cents: 99900, drive_url: 'https://drive.example.com/x' });
  const l = tax.list();
  assert.deepEqual(l.items.map((r) => r.year).slice(0, 4), [2030, 2029, 2028, 2027]);
  assert.equal(l.total_refund_cents, 150000);
  assert.equal(tax.get(2030).todos.items.length >= 1, true);
  assert.throws(() => tax.save(2027, { drive_url: 'javascript:x' }), /https/);
  assert.throws(() => tax.save(2027, { status: 'irgendwas' }), /Status/);
});

test('tax years: payout, advisor fee and result after advice; final documents must be https', () => {
  const tax = require('../lib/tax-years');
  tax.save(2026, { status: 'abgeschlossen', refund_cents: 200000, paid_on: '2027-04-01', paid_cents: 190000, advisor_cents: 50000, return_url: 'https://drive.example.com/r', notice_url: 'https://drive.example.com/n' });
  tax.save(2025, { status: 'Bescheid erhalten', refund_cents: 30000, advisor_cents: 10000 });
  tax.save(2024, { status: 'eingereicht', refund_cents: 70000, advisor_cents: 5000 });
  const t = tax.get(2026).year;
  assert.equal(t.net_cents, 140000);
  assert.equal(t.return_url, 'https://drive.example.com/r');
  assert.equal(tax.get(2025).year.net_cents, 20000, 'without payout the notice counts');
  assert.equal(tax.get(2024).year.net_cents, -5000, 'filed only: just the fee');
  assert.equal(tax.net({ status: 'in Vorbereitung', refund_cents: 1 }), null);
  const l = tax.list();
  assert.equal(l.total_advisor_cents, 65000);
  assert.equal(l.total_paid_cents, 190000);
  assert.ok(l.items.find((r) => r.year === 2026).net_cents === 140000);
  tax.save(2026, { note: 'x' });
  assert.equal(tax.get(2026).year.paid_cents, 190000, 'partial save keeps the other fields');
  assert.throws(() => tax.save(2026, { notice_url: 'http://x' }), /https/);
  assert.throws(() => tax.save(2026, { advisor_cents: -1 }), /Berater/);
  assert.throws(() => tax.save(2026, { paid_on: '1.4.2027' }), /Datum/);
});
