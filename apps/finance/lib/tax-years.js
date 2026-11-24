'use strict';
/**
 * Modul Einkommensteuer (24.11.2026): one row per tax year with status, refund (+) or back payment (-), the day it
 * was filed and the notice came, and links to the Drive folder, the draft and the invoice overview. Years that only
 * have documents on the to-do list appear too. Since 26.11.56 also the final return and notice (links), the payout by the
 * tax office (day and amount) and the advisor fee, so each year shows its result after advice. Real values live in
 * the database only.
 */
const { getDb } = require('./db');
const todos = require('./doc-todos');

const STATUSES = ['in Vorbereitung', 'beim Steuerberater', 'eingereicht', 'Bescheid erhalten', 'abgeschlossen'];
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const URL_RE = /^https:\/\/[^\s<>"]+$/;

/** Result after advice: what the tax office paid (or, before payout, what the notice says) minus the advisor fee. */
function net(r) {
  const base = r.paid_cents ?? (['Bescheid erhalten', 'abgeschlossen'].includes(r.status) ? r.refund_cents : null);
  if (base == null && !r.advisor_cents) return null;
  return (base || 0) - (r.advisor_cents || 0);
}

function list() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM tax_years').all().map((r) => ({ ...r }));
  const open = new Map(db.prepare('SELECT year, sum(done_at IS NULL) open, count(*) n FROM doc_todos GROUP BY year').all().map((r) => [r.year, r]));
  const years = [...new Set([...rows.map((r) => r.year), ...open.keys()])].sort((a, b) => b - a);
  const items = years.map((y) => ({ ...(rows.find((r) => r.year === y) || { year: y, status: 'in Vorbereitung', refund_cents: null, note: '' }), open_todos: open.get(y)?.open || 0, todos: open.get(y)?.n || 0 }));
  for (const r of items) r.net_cents = net(r);
  const settled = items.filter((r) => r.refund_cents != null && ['Bescheid erhalten', 'abgeschlossen'].includes(r.status));
  const sum = (k) => items.reduce((s, r) => s + (r[k] || 0), 0);
  return { statuses: STATUSES, items, total_refund_cents: settled.reduce((s, r) => s + r.refund_cents, 0), total_paid_cents: sum('paid_cents'), total_advisor_cents: sum('advisor_cents'), total_net_cents: sum('net_cents'), open_todos: items.reduce((s, r) => s + r.open_todos, 0) };
}

function get(year) {
  const y = Number(year); if (!Number.isInteger(y)) throw bad('Jahr ungültig');
  const row = getDb().prepare('SELECT * FROM tax_years WHERE year = ?').get(y);
  const t = { ...(row || { year: y, status: 'in Vorbereitung', refund_cents: null, note: '' }) };
  t.net_cents = net(t);
  return { statuses: STATUSES, year: t, todos: todos.list(y) };
}

function save(year, input) {
  const y = Number(year); if (!Number.isInteger(y) || y < 2000 || y > 2100) throw bad('Jahr ungültig');
  const cur = getDb().prepare('SELECT * FROM tax_years WHERE year = ?').get(y) || {};
  const v = { status: cur.status || 'in Vorbereitung', refund_cents: cur.refund_cents ?? null, filed_on: cur.filed_on || null, notice_on: cur.notice_on || null, drive_url: cur.drive_url || null, draft_url: cur.draft_url || null, invoices_url: cur.invoices_url || null, return_url: cur.return_url || null, notice_url: cur.notice_url || null, paid_on: cur.paid_on || null, paid_cents: cur.paid_cents ?? null, advisor_cents: cur.advisor_cents ?? null, note: cur.note || '' };
  for (const k of Object.keys(v)) if (k in input) v[k] = input[k] === '' ? null : input[k];
  if (!STATUSES.includes(v.status)) throw bad('Status unbekannt');
  for (const k of ['refund_cents', 'paid_cents']) if (v[k] != null && !Number.isInteger(v[k])) throw bad('Betrag ungültig');
  if (v.advisor_cents != null && (!Number.isInteger(v.advisor_cents) || v.advisor_cents < 0)) throw bad('Beraterkosten ungültig');
  for (const k of ['filed_on', 'notice_on', 'paid_on']) if (v[k] && !/^\d{4}-\d{2}-\d{2}$/.test(v[k])) throw bad('Datum ungültig');
  for (const k of ['drive_url', 'draft_url', 'invoices_url', 'return_url', 'notice_url']) if (v[k] && (!URL_RE.test(v[k]) || v[k].length > 400)) throw bad('Link muss mit https:// beginnen');
  v.note = String(v.note || '').slice(0, 1000);
  const cols = ['status', 'refund_cents', 'filed_on', 'notice_on', 'drive_url', 'draft_url', 'invoices_url', 'return_url', 'notice_url', 'paid_on', 'paid_cents', 'advisor_cents', 'note'];
  getDb().prepare(`INSERT INTO tax_years (year, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')}) ON CONFLICT (year) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}`)
    .run(y, ...cols.map((c) => v[c]));
}

module.exports = { STATUSES, list, get, save, net };
