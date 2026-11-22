'use strict';
/**
 * Categories are learned from what the person decided before: counterparty → category.
 * A suggestion is applied automatically only when the same partner was booked the same way at least twice
 * and never differently; everything else lands in "Zu prüfen" with the suggestion shown.
 * With an account, a rule books automatically only if the family booked that category themselves on an account of the
 * same area (Privat/Immobilien/Treuhand) before (22.11.2026: "Bundesagentur für Arbeit" Kindergeld learned privately
 * booked a tenant's rent paid by the job centre on a flat's account as Kindergeld).
 */
const { getDb } = require('./db');
const { normalize } = require('./counterparty');

const AUTO_AFTER = 2;
const now = () => new Date().toISOString();

// Rules learned on Immobilien/Treuhand accounts are kept per area ("immobilien:<partner>"), private ones without prefix.
const scopedKey = (key, account) => { const s = account == null ? 'haushalt' : scopeOf(account); return s === 'haushalt' ? key : `${s}:${key}`; };

function learn(counterparty, category, account) {
  const base = normalize(counterparty); const key = base && scopedKey(base, account);
  if (!key || !category) return;
  getDb().prepare('INSERT INTO rules (counterparty, category, hits, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT (counterparty, category) DO UPDATE SET hits = hits + 1, updated_at = excluded.updated_at').run(key, category, now());
}

const scopeOf = (account) => getDb().prepare('SELECT scope FROM accounts WHERE name = ?').get(account)?.scope || 'haushalt';
function bookedInScope(category, scope) {
  return !!getDb().prepare(`SELECT 1 FROM transactions t WHERE t.category = ? AND t.category_source IN ('manual', 'import')
    AND COALESCE((SELECT scope FROM accounts WHERE name = t.account), 'haushalt') = ? LIMIT 1`).get(category, scope);
}

function suggest(counterparty, account) {
  const key = normalize(counterparty);
  if (!key) return null;
  const q = getDb().prepare('SELECT category, hits FROM rules WHERE counterparty = ? ORDER BY hits DESC');
  const scoped = account != null ? scopedKey(key, account) : key;
  let rows = q.all(scoped); const own = rows.length > 0 && scoped !== key;
  if (!rows.length) rows = q.all(key);
  if (!rows.length) return null;
  const [best] = rows; const others = rows.slice(1).reduce((s, r) => s + r.hits, 0);
  const sure = best.hits >= AUTO_AFTER && others === 0 && (own || account == null || bookedInScope(best.category, scopeOf(account)));
  return { category: best.category, sure };
}

/** Builds the rules from all booked transactions again, e.g. after the first import. */
function rebuild() {
  const db = getDb();
  db.exec('DELETE FROM rules');
  const rows = db.prepare("SELECT account, counterparty, category FROM transactions WHERE category IS NOT NULL AND category_source IN ('manual', 'import')").all();
  db.exec('BEGIN');
  try { for (const r of rows) learn(r.counterparty, r.category, r.account); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { learn, suggest, rebuild, AUTO_AFTER };
