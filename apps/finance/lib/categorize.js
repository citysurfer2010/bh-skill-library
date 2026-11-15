'use strict';
/**
 * Categories are learned from what the person decided before: counterparty → category.
 * A suggestion is applied automatically only when the same partner was booked the same way at least twice
 * and never differently; everything else lands in "Zu prüfen" with the suggestion shown.
 */
const { getDb } = require('./db');
const { normalize } = require('./counterparty');

const AUTO_AFTER = 2;
const now = () => new Date().toISOString();

function learn(counterparty, category) {
  const key = normalize(counterparty);
  if (!key || !category) return;
  getDb().prepare('INSERT INTO rules (counterparty, category, hits, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT (counterparty, category) DO UPDATE SET hits = hits + 1, updated_at = excluded.updated_at').run(key, category, now());
}

function suggest(counterparty) {
  const key = normalize(counterparty);
  if (!key) return null;
  const rows = getDb().prepare('SELECT category, hits FROM rules WHERE counterparty = ? ORDER BY hits DESC').all(key);
  if (!rows.length) return null;
  const [best] = rows; const others = rows.slice(1).reduce((s, r) => s + r.hits, 0);
  return { category: best.category, sure: best.hits >= AUTO_AFTER && others === 0 };
}

/** Builds the rules from all booked transactions again, e.g. after the first import. */
function rebuild() {
  const db = getDb();
  db.exec('DELETE FROM rules');
  const rows = db.prepare("SELECT counterparty, category FROM transactions WHERE category IS NOT NULL AND category_source IN ('manual', 'import')").all();
  db.exec('BEGIN');
  try { for (const r of rows) learn(r.counterparty, r.category); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { learn, suggest, rebuild, AUTO_AFTER };
