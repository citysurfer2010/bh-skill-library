'use strict';
/**
 * All ledger accounts in one place: CSV-only and bank-connected, with their scope.
 * Only scope "haushalt" counts in the overview, investments and the open worklist; rental and trust accounts
 * (Mietenkonto, Kautionskonto) stay visible here but would otherwise distort the household figures.
 */
const { getDb } = require('./db');

// Shown as „Privat“ (Matti 15.11.2026); stored as haushalt because the overview counts it as the household.
const SCOPES = { haushalt: 'Privat', immobilien: 'Immobilien', treuhand: 'Treuhand' };
const now = () => new Date().toISOString();
/** SQL condition on transactions.account: true for household accounts only. */
const HOUSEHOLD = "account NOT IN (SELECT name FROM accounts WHERE scope != 'haushalt')";

/** First guess from what the bank says about the account; the person can change it at any time. */
function defaultScope({ product = '', details = '', usage = '' } = {}) {
  const text = `${product} ${details}`;
  if (usage === 'ORGA' || /treuhand|kaution/i.test(text)) return 'treuhand';
  if (/mietenkonto|mietkonto|geschäftskonto/i.test(text)) return 'immobilien';
  return 'haushalt';
}

/** Only sets a scope when the account has none yet, so a choice of the person is never overwritten. */
function ensure(name, scope = 'haushalt') {
  getDb().prepare('INSERT OR IGNORE INTO accounts (name, scope, updated_at) VALUES (?, ?, ?)').run(name, scope, now());
}

function list() {
  const db = getDb();
  const stats = db.prepare('SELECT account AS name, count(*) AS n, sum(category IS NULL) AS open, min(booked_on) AS first, max(booked_on) AS last FROM transactions GROUP BY account').all();
  const bank = db.prepare('SELECT a.label, a.aspsp, a.iban, a.product, a.details, a.name AS holder, a.last_sync_at, a.balance_cents, a.balance_on, s.status FROM bank_accounts a JOIN bank_sessions s ON s.session_id = a.session_id').all();
  const scopes = Object.fromEntries(db.prepare('SELECT name, scope FROM accounts').all().map((r) => [r.name, r.scope]));
  const byName = new Map(stats.map((s) => [s.name, { ...s }]));
  for (const b of bank) if (!byName.has(b.label)) byName.set(b.label, { name: b.label, n: 0, open: 0, first: null, last: null });
  const mask = (iban) => (iban ? `${iban.slice(0, 4)} … ${iban.slice(-4)}` : '');
  return [...byName.values()].map((a) => {
    const b = bank.find((x) => x.label === a.name);
    return { ...a, scope: scopes[a.name] || 'haushalt', balance: b && b.balance_cents != null ? b.balance_cents : null, balance_on: b?.balance_on || null, bank: b ? { aspsp: b.aspsp, iban: mask(b.iban), product: b.product || '', details: b.details || b.holder || '', status: b.status, last_sync_at: b.last_sync_at } : null };
  }).sort((x, y) => Object.keys(SCOPES).indexOf(x.scope) - Object.keys(SCOPES).indexOf(y.scope) || x.name.localeCompare(y.name, 'de'));
}

/** Money per scope from the bank balances; accounts without a balance (CSV only) are counted apart. */
function totals(list = listCache()) {
  const out = Object.fromEntries(Object.keys(SCOPES).map((k) => [k, { cents: 0, accounts: 0, withoutBalance: 0, asOf: null }]));
  for (const a of list) {
    const t = out[a.scope]; t.accounts += 1;
    if (a.balance == null) t.withoutBalance += 1; else { t.cents += a.balance; if (!t.asOf || a.balance_on < t.asOf) t.asOf = a.balance_on; }
  }
  return out;
}
const listCache = () => list();

function setScope(name, scope) {
  if (!SCOPES[scope]) throw Object.assign(new Error('Bereich unbekannt'), { status: 400 });
  getDb().prepare('INSERT INTO accounts (name, scope, updated_at) VALUES (?, ?, ?) ON CONFLICT (name) DO UPDATE SET scope = excluded.scope, updated_at = excluded.updated_at').run(name, scope, now());
}

/**
 * Renames a whole account: its lines, its bank link and its scope. A name already in use is refused,
 * except that a bank account may join a CSV account of that name after a yes (merge: true; bank-sync merges the lines).
 */
function rename(oldName, newName, { mergeBank, merge = false } = {}) {
  const l = String(newName || '').trim();
  if (!l || l.length > 60) throw Object.assign(new Error('Name 1 bis 60 Zeichen'), { status: 400 });
  if (l === oldName) return true;
  const db = getDb();
  const known = (n) => !!(db.prepare('SELECT 1 FROM transactions WHERE account = ? LIMIT 1').get(n) || db.prepare('SELECT 1 FROM bank_accounts WHERE label = ?').get(n));
  if (!known(oldName)) return false;
  const bankAcc = db.prepare('SELECT uid FROM bank_accounts WHERE label = ?').get(oldName);
  if (known(l)) {
    if (bankAcc && mergeBank && !db.prepare('SELECT 1 FROM bank_accounts WHERE label = ?').get(l)) {
      // Merging cannot be undone, so it only happens after the person said yes.
      if (!merge) throw Object.assign(new Error(`Das Konto „${l}“ gibt es schon. Zusammenführen?`), { status: 409, code: 'merge' });
      return mergeBank(bankAcc.uid, l);
    }
    throw Object.assign(new Error('Diesen Kontonamen gibt es schon'), { status: 400 });
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE transactions SET account = ? WHERE account = ?').run(l, oldName);
    db.prepare('UPDATE bank_accounts SET label = ? WHERE label = ?').run(l, oldName);
    db.prepare('UPDATE accounts SET name = ?, updated_at = ? WHERE name = ?').run(l, now(), oldName);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return true;
}

module.exports = { SCOPES, HOUSEHOLD, defaultScope, ensure, list, totals, setScope, rename };
