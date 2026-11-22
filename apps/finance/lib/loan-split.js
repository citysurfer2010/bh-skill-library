'use strict';
/**
 * Loan rates split into interest and repayment (22.11.2026: "ja aufteilen", for private and property accounts).
 * The interest (and fees) is spending ("Immobilienkredite"), the repayment builds wealth ("Tilgung Immobilienkredite",
 * kind Investment): the debt falls by that amount. The split comes from the bank's own text (BBBank/PSD "RECHN.ZINS …
 * TILG./ENTG. …", "Darl.-Leistung … Tilgung … Zinsen …"); a rate without it stays whole. The booking stays one line;
 * a booking moved to another category loses its split.
 */
const { getDb } = require('./db');
const { parse } = require('./loans');

const RATE = 'IMMORATE'; const REPAY = 'TILG';

function detect() {
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM categories WHERE code = ?').get(REPAY)) return { split: 0, removed: 0 };
  const removed = db.prepare('DELETE FROM transaction_splits WHERE transaction_id IN (SELECT id FROM transactions WHERE category IS NOT ?)').run(RATE).changes;
  const put = db.prepare('INSERT OR REPLACE INTO transaction_splits (transaction_id, category, cents) VALUES (?, ?, ?)');
  const drop = db.prepare('DELETE FROM transaction_splits WHERE transaction_id = ?');
  let split = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const t of db.prepare('SELECT id, amount_cents, text FROM transactions WHERE category = ? AND amount_cents < 0').all(RATE)) {
      const p = parse(t.text); const repay = p && !p.rateOnly ? p.principal : 0;
      if (!repay || repay > -t.amount_cents) { drop.run(t.id); continue; } // no split in the text, or it does not fit the amount
      drop.run(t.id); put.run(t.id, REPAY, -repay); if (repay < -t.amount_cents) put.run(t.id, RATE, t.amount_cents + repay); split += 1;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { split, removed };
}

module.exports = { detect, RATE, REPAY };
