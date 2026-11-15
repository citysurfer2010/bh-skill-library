'use strict';
/**
 * Categories: create and change name, kind, purpose and monthly budget (Matti 15.11.2026: "weitere Kategorie hinzufügen").
 * The code is the stable key in bookings and rules; it is set once and never changed here.
 */
const { getDb } = require('./db');

/** Kinds and where they count; report.js reads Investment/Rücklagen as investments and leaves Übertrag out of the totals. */
const ARTS = ['Ausgaben', 'Einnahmen', 'Investment', 'Rücklagen', 'Auslagen', 'Übertrag'];

const fail = (status, error) => Object.assign(new Error(error), { status });

/** "Haustiere & Futter" → "HAUSTIERE"; letters, digits, - and _ only, at most 12 characters. */
function codeFrom(name) {
  const first = String(name || '').trim().split(/[\s&/,+]+/)[0] || '';
  return first.toUpperCase().replace(/[^A-Z0-9ÄÖÜ_-]/g, '').slice(0, 12);
}

function clean(input, { partial = false } = {}) {
  const out = {};
  if (!partial || input.name !== undefined) {
    out.name = String(input.name || '').trim();
    if (!out.name || out.name.length > 60) throw fail(400, 'Name fehlt oder ist länger als 60 Zeichen');
  }
  if (!partial || input.art !== undefined) {
    out.art = String(input.art || '');
    if (!ARTS.includes(out.art)) throw fail(400, 'Art unbekannt');
  }
  if (input.description !== undefined) out.description = String(input.description || '').trim().slice(0, 200);
  if (input.budget_cents !== undefined) {
    const b = input.budget_cents; out.budget_cents = b === null || b === '' ? null : Math.round(Number(b));
    if (out.budget_cents !== null && (!Number.isFinite(out.budget_cents) || out.budget_cents < 0)) throw fail(400, 'Budget ungültig');
  }
  return out;
}

function nameTaken(db, name, except = '') {
  return db.prepare('SELECT code FROM categories WHERE lower(name) = lower(?) AND code != ?').get(name, except);
}

function create(input = {}) {
  const db = getDb(); const c = clean(input);
  const code = String(input.code || codeFrom(c.name)).trim().toUpperCase();
  if (!/^[A-Z0-9ÄÖÜ_-]{2,12}$/.test(code)) throw fail(400, 'Kürzel: 2 bis 12 Großbuchstaben, Ziffern, - oder _');
  if (db.prepare('SELECT 1 FROM categories WHERE code = ?').get(code)) throw fail(409, `Das Kürzel ${code} gibt es schon`);
  if (nameTaken(db, c.name)) throw fail(409, `Eine Kategorie „${c.name}“ gibt es schon`);
  db.prepare('INSERT INTO categories (code, art, name, description, budget_cents) VALUES (?, ?, ?, ?, ?)')
    .run(code, c.art, c.name, c.description || '', c.budget_cents ?? null);
  return db.prepare('SELECT * FROM categories WHERE code = ?').get(code);
}

function update(code, input = {}) {
  const db = getDb(); const c = clean(input, { partial: true });
  if (!db.prepare('SELECT 1 FROM categories WHERE code = ?').get(code)) throw fail(404, 'Kategorie nicht gefunden');
  if (c.name && nameTaken(db, c.name, code)) throw fail(409, `Eine Kategorie „${c.name}“ gibt es schon`);
  const keys = Object.keys(c);
  if (keys.length) db.prepare(`UPDATE categories SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE code = ?`).run(...keys.map((k) => c[k]), code);
}

module.exports = { ARTS, codeFrom, create, update };
