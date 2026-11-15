'use strict';
/**
 * Fixed rules on the payment text, for partners whose lines mean different things (Matti 15.11.2026: the DKB business
 * account pays a monthly ETF savings plan to "DKB AG", which also charges fees, so the counterparty rule never gets sure).
 * Only lines nobody decided yet (open or booked by a learned rule) are changed; the person's choices stay.
 */
const { getDb } = require('./db');

const RULES = [
  { code: 'AKTIEN', test: (t, cents) => cents < 0 && /Wertp\.?\s?Abrechn|Wertpapier(?!.*geb)|Sparplan|\bISIN\s?[A-Z]{2}[A-Z0-9]{9}\d\b/i.test(t) },
  { code: 'KONTO', test: (t, cents) => cents < 0 && /Depotgeb(?:ue|ü|u)hr|Abrechnung .*Information zur Abrechnung|Kontof(?:ue|ü|u)hrungsentgelt|\bEntgelt[;:]?\s+(?:Visa|Konto|Karte|Girocard)/i.test(t) },
];

function detect() {
  const db = getDb();
  const known = new Set(db.prepare('SELECT code FROM categories').all().map((r) => r.code));
  const rules = RULES.filter((r) => known.has(r.code));
  if (!rules.length) return { changed: 0 };
  const mark = db.prepare("UPDATE transactions SET category = ?, category_source = 'text', suggestion = NULL WHERE id = ?");
  let changed = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const r of db.prepare("SELECT id, text, amount_cents FROM transactions WHERE category IS NULL OR category_source = 'rule'").all()) {
      const hit = rules.find((x) => x.test(r.text || '', r.amount_cents)); if (hit) changed += mark.run(hit.code, r.id).changes;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { changed };
}

module.exports = { detect, RULES };
