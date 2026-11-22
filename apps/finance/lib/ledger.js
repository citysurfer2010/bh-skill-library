'use strict';
/** Writing transactions: import with duplicate check, and the person's corrections. */
const crypto = require('crypto');
const { getDb } = require('./db');
const categorize = require('./categorize');
const { normalize } = require('./counterparty');

const now = () => new Date().toISOString();
const hashOf = (account, r, n) => crypto.createHash('sha256').update([account, r.date, r.cents, r.text.replace(/\s+/g, ' ').trim(), n].join('|')).digest('hex');

/** Rule lookup for a new line: sure rules book it, otherwise the suggestion waits for the person. */
function classify(counterparty, account) {
  const s = categorize.suggest(counterparty, account);
  if (s?.sure) return { category: s.category, source: 'rule', suggestion: null };
  return { category: null, source: null, suggestion: s ? s.category : null };
}

function knownCategory(code) { return !!(code && getDb().prepare('SELECT 1 FROM categories WHERE code = ?').get(code)); }

/** Identical lines in one file are real (two equal purchases); they are told apart by their position among equals. */
function importRows({ filename, format, account, rows, user, keepCategories = false }) {
  const db = getDb(); const seen = new Map(); let added = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const imp = db.prepare('INSERT INTO imports (filename, format, account, rows, added, duplicates, created_by, created_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)').run(filename, format, account, rows.length, user, now());
    // A CSV line that the bank fetch already brought (same account, day and amount) is a duplicate.
    const bankCount = db.prepare('SELECT count(*) AS n FROM transactions WHERE account = ? AND booked_on = ? AND amount_cents = ? AND bank_ref IS NOT NULL');
    const used = new Map();
    const fromBank = (acc, date, cents) => {
      const k = [acc, date, cents].join('|'); const n = used.get(k) || 0;
      if (bankCount.get(acc, date, cents).n <= n) return false;
      used.set(k, n + 1); return true;
    };
    const insert = db.prepare('INSERT OR IGNORE INTO transactions (account, booked_on, amount_cents, kind, text, counterparty, category, category_source, suggestion, note, hash, import_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const r of rows) {
      const key = [r.date, r.cents, r.text].join('|'); const n = (seen.get(key) || 0) + 1; seen.set(key, n);
      if (fromBank(r.account || account, r.date, r.cents)) continue;
      const { category, source, suggestion } = keepCategories && knownCategory(r.category) ? { category: r.category, source: 'import', suggestion: null } : classify(r.counterparty, r.account || account);
      added += insert.run(r.account || account, r.date, r.cents, r.kind || '', r.text || '', r.counterparty || '', category, source, suggestion, r.note || '', hashOf(r.account || account, r, n), imp.lastInsertRowid, now()).changes;
    }
    db.prepare('UPDATE imports SET added = ?, duplicates = ? WHERE id = ?').run(added, rows.length - added, imp.lastInsertRowid);
    db.exec('COMMIT');
    return { added, duplicates: rows.length - added };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/** A correction is a signal: it teaches the rule and books open transactions of the same partner once the rule is sure. */
function setCategory(id, category, note) {
  const db = getDb();
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!tx) return null;
  if (category !== undefined) {
    if (category !== null && !knownCategory(category)) throw new Error('Unbekannte Kategorie');
    db.prepare("UPDATE transactions SET category = ?, category_source = 'manual', suggestion = NULL WHERE id = ?").run(category, id);
    if (category) categorize.learn(tx.counterparty, category, tx.account);
    // Payment and refund of one Amazon order move together (Matti 22.11.2026: "wenn man die Kat ändert soll sich beides ändern").
    if (category && tx.amazon_order) db.prepare("UPDATE transactions SET category = ?, category_source = 'manual', suggestion = NULL WHERE amazon_order = ? AND id != ? AND (amount_cents > 0) != ?").run(category, tx.amazon_order, id, tx.amount_cents > 0 ? 1 : 0);
  }
  if (note !== undefined) db.prepare('UPDATE transactions SET note = ? WHERE id = ?').run(String(note).slice(0, 300), id);
  let applied = 0;
  if (category) {
    const key = normalize(tx.counterparty);
    const open = db.prepare('SELECT id, account, counterparty FROM transactions WHERE category IS NULL').all().filter((o) => normalize(o.counterparty) === key);
    for (const o of open) {
      const s = categorize.suggest(tx.counterparty, o.account);
      if (s?.sure) applied += db.prepare("UPDATE transactions SET category = ?, category_source = 'rule', suggestion = NULL WHERE id = ?").run(s.category, o.id).changes;
      else db.prepare('UPDATE transactions SET suggestion = ? WHERE id = ?').run(category, o.id);
    }
  }
  return { transaction: db.prepare('SELECT * FROM transactions WHERE id = ?').get(id), applied };
}

module.exports = { importRows, setCategory, classify, hashOf };
