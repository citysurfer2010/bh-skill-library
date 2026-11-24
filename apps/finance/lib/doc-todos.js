'use strict';
/**
 * Unterlagen (24.11.2026: "eine ToDo-Liste mit Dokumenten, die ich noch besorgen / scannen muss"): per tax year the
 * documents still missing, with the flat they belong to, what has to be done and a note. Done items keep their date.
 */
const { getDb } = require('./db');

const KINDS = ['Besorgen', 'Scannen', 'Anfordern', 'Prüfen'];
const bad = (m) => Object.assign(new Error(m), { status: 400 });

function list(year) {
  const y = Number(year) || null;
  const rows = getDb().prepare(`SELECT id, year, title, unit, kind, note, done_at, created_at FROM doc_todos ${y ? 'WHERE year = ?' : ''} ORDER BY done_at IS NOT NULL, year DESC, unit, id`).all(...(y ? [y] : []));
  const years = getDb().prepare('SELECT DISTINCT year FROM doc_todos ORDER BY year DESC').all().map((r) => r.year);
  return { kinds: KINDS, years, items: rows.map((r) => ({ ...r })), open: rows.filter((r) => !r.done_at).length };
}

function clean({ year, title, unit = '', kind = 'Besorgen', note = '' }) {
  const y = Number(year); const t = String(title || '').trim();
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw bad('Jahr ungültig');
  if (!t) throw bad('Titel fehlt');
  if (!KINDS.includes(kind)) throw bad('Art unbekannt');
  return { year: y, title: t.slice(0, 200), unit: String(unit || '').trim().slice(0, 100), kind, note: String(note || '').trim().slice(0, 500) };
}

function add(input) {
  const v = clean(input);
  return Number(getDb().prepare('INSERT INTO doc_todos (year, title, unit, kind, note, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(v.year, v.title, v.unit, v.kind, v.note, new Date().toISOString()).lastInsertRowid);
}

function update(id, input) {
  const db = getDb(); const cur = db.prepare('SELECT * FROM doc_todos WHERE id = ?').get(Number(id)); if (!cur) return false;
  if ('done' in input) db.prepare('UPDATE doc_todos SET done_at = ? WHERE id = ?').run(input.done ? new Date().toISOString().slice(0, 10) : null, cur.id);
  if (['title', 'unit', 'kind', 'note', 'year'].some((k) => k in input)) {
    const v = clean({ ...cur, ...input });
    db.prepare('UPDATE doc_todos SET year = ?, title = ?, unit = ?, kind = ?, note = ? WHERE id = ?').run(v.year, v.title, v.unit, v.kind, v.note, cur.id);
  }
  return true;
}

function remove(id) { return getDb().prepare('DELETE FROM doc_todos WHERE id = ?').run(Number(id)).changes > 0; }

module.exports = { KINDS, list, add, update, remove };
