'use strict';
/**
 * Modul Einkommensteuer (24.11.2026): one row per tax year with status, refund (+) or back payment (-), the day it
 * was filed and the notice came, and links to the Drive folder, the draft and the invoice overview. Years that only
 * have documents on the to-do list appear too. Real values live in the database only.
 */
const { getDb } = require('./db');
const todos = require('./doc-todos');

const STATUSES = ['in Vorbereitung', 'beim Steuerberater', 'eingereicht', 'Bescheid erhalten', 'abgeschlossen'];
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const URL_RE = /^https:\/\/[^\s<>"]+$/;

function list() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM tax_years').all().map((r) => ({ ...r }));
  const open = new Map(db.prepare('SELECT year, sum(done_at IS NULL) open, count(*) n FROM doc_todos GROUP BY year').all().map((r) => [r.year, r]));
  const years = [...new Set([...rows.map((r) => r.year), ...open.keys()])].sort((a, b) => b - a);
  const items = years.map((y) => ({ ...(rows.find((r) => r.year === y) || { year: y, status: 'in Vorbereitung', refund_cents: null, note: '' }), open_todos: open.get(y)?.open || 0, todos: open.get(y)?.n || 0 }));
  const settled = items.filter((r) => r.refund_cents != null && ['Bescheid erhalten', 'abgeschlossen'].includes(r.status));
  return { statuses: STATUSES, items, total_refund_cents: settled.reduce((s, r) => s + r.refund_cents, 0), open_todos: items.reduce((s, r) => s + r.open_todos, 0) };
}

function get(year) {
  const y = Number(year); if (!Number.isInteger(y)) throw bad('Jahr ungültig');
  const row = getDb().prepare('SELECT * FROM tax_years WHERE year = ?').get(y);
  return { statuses: STATUSES, year: { ...(row || { year: y, status: 'in Vorbereitung', refund_cents: null, note: '' }) }, todos: todos.list(y) };
}

function save(year, input) {
  const y = Number(year); if (!Number.isInteger(y) || y < 2000 || y > 2100) throw bad('Jahr ungültig');
  const cur = getDb().prepare('SELECT * FROM tax_years WHERE year = ?').get(y) || {};
  const v = { status: cur.status || 'in Vorbereitung', refund_cents: cur.refund_cents ?? null, filed_on: cur.filed_on || null, notice_on: cur.notice_on || null, drive_url: cur.drive_url || null, draft_url: cur.draft_url || null, invoices_url: cur.invoices_url || null, note: cur.note || '' };
  for (const k of Object.keys(v)) if (k in input) v[k] = input[k] === '' ? null : input[k];
  if (!STATUSES.includes(v.status)) throw bad('Status unbekannt');
  if (v.refund_cents != null && !Number.isInteger(v.refund_cents)) throw bad('Betrag ungültig');
  for (const k of ['filed_on', 'notice_on']) if (v[k] && !/^\d{4}-\d{2}-\d{2}$/.test(v[k])) throw bad('Datum ungültig');
  for (const k of ['drive_url', 'draft_url', 'invoices_url']) if (v[k] && (!URL_RE.test(v[k]) || v[k].length > 400)) throw bad('Link muss mit https:// beginnen');
  v.note = String(v.note || '').slice(0, 1000);
  getDb().prepare('INSERT INTO tax_years (year, status, refund_cents, filed_on, notice_on, drive_url, draft_url, invoices_url, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (year) DO UPDATE SET status = excluded.status, refund_cents = excluded.refund_cents, filed_on = excluded.filed_on, notice_on = excluded.notice_on, drive_url = excluded.drive_url, draft_url = excluded.draft_url, invoices_url = excluded.invoices_url, note = excluded.note')
    .run(y, v.status, v.refund_cents, v.filed_on, v.notice_on, v.drive_url, v.draft_url, v.invoices_url, v.note);
}

module.exports = { STATUSES, list, get, save };
