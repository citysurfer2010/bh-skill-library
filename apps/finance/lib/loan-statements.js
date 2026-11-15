'use strict';
/**
 * Loan statements of the bank (BBBank half-year "Kontoauszug" of the loan account): account number, old and new
 * balance, interest rate. Each statement gives two balances, so a missing year is covered by the next one's old balance.
 * Only accounts of a known loan are kept; the papers' folder of a loan is stored as a link.
 */
const { getDb } = require('./db');

const cents = (s) => Math.round(Number(String(s).replace(/\./g, '').replace(',', '.')) * 100);
const iso = (d) => { const [dd, mm, yy] = d.split('.'); return `${yy}-${mm}-${dd}`; };

/** { ref, balances: [{ on, cents }], rate } or null when the text is no loan statement. */
function parse(text) {
  const t = String(text || '').replace(/[ \t]+/g, ' ');
  const ref = /Kontonummer (\d{6,12})/.exec(t)?.[1];
  if (!ref || !/Kontostand/.test(t)) return null;
  const balances = [];
  for (const m of t.matchAll(/(?:alter|neuer) Kontostand vom (\d{2}\.\d{2}\.\d{4}) ([\d.]+,\d{2}) ?([SH])/g)) balances.push({ on: iso(m[1]), cents: (m[3] === 'S' ? 1 : -1) * cents(m[2]) });
  const rate = /([\d]+,\d+)% Sollzins/.exec(t)?.[1];
  return balances.length ? { ref: ref.replace(/^0+/, ''), balances, rate: rate ? Number(rate.replace(',', '.')) : null } : null;
}

/** Statements in ({ name, text }), docs ({ ref, url }) too; returns how many balances were stored. */
function importStatements({ statements = [], docs = [] }, knownRefs) {
  const db = getDb(); let balances = 0; let skipped = 0;
  const ins = db.prepare('INSERT INTO loan_balances (ref, balance_on, balance_cents, rate_pct) VALUES (?, ?, ?, ?) ON CONFLICT (ref, balance_on) DO UPDATE SET balance_cents = excluded.balance_cents, rate_pct = COALESCE(excluded.rate_pct, rate_pct)');
  const doc = db.prepare('INSERT INTO loan_docs (ref, url) VALUES (?, ?) ON CONFLICT (ref) DO UPDATE SET url = excluded.url');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const s of statements) {
      const p = parse(s.text);
      if (!p || !knownRefs.has(p.ref)) { skipped += 1; continue; }
      for (const b of p.balances) balances += ins.run(p.ref, b.on, b.cents, p.rate).changes;
    }
    for (const d of docs) if (knownRefs.has(String(d.ref)) && /^https:\/\/drive\.google\.com\//.test(d.url || '')) doc.run(String(d.ref), d.url);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { balances, skipped };
}

/** Balance history, latest rate and papers link of one loan account. */
function of(ref) {
  const db = getDb();
  const history = db.prepare('SELECT balance_on AS "on", balance_cents AS cents FROM loan_balances WHERE ref = ? ORDER BY balance_on').all(ref).map((r) => ({ ...r }));
  const rate = db.prepare('SELECT rate_pct FROM loan_balances WHERE ref = ? AND rate_pct IS NOT NULL ORDER BY balance_on DESC LIMIT 1').get(ref)?.rate_pct ?? null;
  return { history, rate, docs: db.prepare('SELECT url FROM loan_docs WHERE ref = ?').get(ref)?.url || null };
}

module.exports = { parse, importStatements, of };
