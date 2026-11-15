'use strict';
/**
 * Loan statements of the banks: account number, balances, interest rate.
 *   BBBank / PSD  "Kontonummer …", "alter/neuer Kontostand vom DD.MM.YYYY 1.234,56 S", "1,39000% Sollzins(en)", "nomin.Festzinssatz … p.a. 1,23 %"
 *   NordLB        "Darlehen 1234567890, DE…", "Kontostand am DD.MM.YYYY -123.456,78" (Jahresauszug) Each statement gives two balances, so a missing year is covered by the next one's old balance.
 * Only accounts of a known loan are kept; the papers' folder of a loan is stored as a link.
 */
const { getDb } = require('./db');
const { unitsFor } = require('./estate-links');

const cents = (s) => Math.round(Number(String(s).replace(/\./g, '').replace(',', '.')) * 100);
/** Account number inside a German IBAN (same rule as loans.js, kept here to avoid a require cycle). */
const accountNo = (iban) => { const d = String(iban || '').replace(/\s/g, ''); return /^DE\d{20}$/.test(d) ? d.slice(12).replace(/^0+/, '') : ''; };
const iso = (d) => { const [dd, mm, yy] = d.split('.'); return `${yy}-${mm}-${dd}`; };

/** { ref, balances: [{ on, cents }], rate } or null when the text is no loan statement. */
function parse(text) {
  const t = String(text || '').replace(/[ \t]+/g, ' ');
  const nord = /Darlehen (\d{8,12}),/.exec(t)?.[1];
  if (nord && /Kontostand am/.test(t)) {
    const place = (/Darlehen \d{8,12}, (?:DE[\d ]{20,30},)?([^\n]*)/.exec(t)?.[1] || '').trim();
    const balances = [...t.matchAll(/Kontostand am (\d{2}\.\d{2}\.\d{4}) (-?[\d.]+,\d{2})/g)].map((m) => ({ on: iso(m[1]), cents: -Math.round(Number(m[2].replace(/\./g, '').replace(',', '.')) * 100) }));
    const rate = /Sollzins(?:satz)?(?: p\.a\.)?:? ([\d]+,\d+) ?%/.exec(t)?.[1];
    return balances.length ? { ref: nord.replace(/^0+/, ''), balances, rate: rate ? Number(rate.replace(',', '.')) : null, place } : null;
  }
  const ref = /Kontonummer (\d{6,12})/.exec(t)?.[1];
  if (!ref || !/Kontostand/.test(t)) return null;
  const balances = [];
  for (const m of t.matchAll(/(?:alter|neuer) Kontostand vom (\d{2}\.\d{2}\.\d{4}) ([\d.]+,\d{2}) ?([SH])/g)) balances.push({ on: iso(m[1]), cents: (m[3] === 'S' ? 1 : -1) * cents(m[2]) });
  const rate = /([\d]+,\d+)% Sollzins/.exec(t)?.[1] || /Festzinssatz.*?p\.a\. ([\d]+,\d+) ?%/.exec(t)?.[1];
  return balances.length ? { ref: ref.replace(/^0+/, ''), balances, rate: rate ? Number(rate.replace(',', '.')) : null } : null;
}

/**
 * A statement of an account the sheet does not know is given to a loan of the same flat folder when that loan has no
 * account, its bank is the bank of a known loan in the same folder, and it is the only such loan; otherwise it is skipped.
 */
function assign(db, parsed, knownRefs) {
  const byFolder = (folderId) => (folderId ? db.prepare("SELECT unit_key FROM estate_links WHERE folder_url LIKE ?").all(`%/${folderId}`).map((r) => r.unit_key) : []);
  // Folder of the flat first, then the place the statement came from (tax folder), then the address in the statement's header.
  const units = (p) => [byFolder(p.folderId), unitsFor(p.from), unitsFor(p.place)].find((k) => k.length) || [];
  const add = db.prepare('INSERT OR IGNORE INTO loan_refs (unit_key, position, ref) VALUES (?, ?, ?)');
  for (const p of parsed.filter((x) => !knownRefs.has(x.ref))) {
    const keys = units(p); if (!keys.length) continue;
    const inFolder = db.prepare(`SELECT l.*, r.ref AS known_ref FROM loans l LEFT JOIN loan_refs r USING (unit_key, position) WHERE l.unit_key IN (${keys.map(() => '?').join(',')})`).all(...keys);
    const known = new Set(parsed.filter((x) => knownRefs.has(x.ref) && units(x).some((k) => keys.includes(k))).map((x) => x.ref));
    const banks = new Set(inFolder.filter((l) => known.has(accountNo(l.account_iban)) || known.has(l.known_ref)).map((l) => l.lender));
    const free = inFolder.filter((l) => !l.account_iban && !l.known_ref && banks.has(l.lender));
    if (free.length === 1) { add.run(free[0].unit_key, free[0].position, p.ref); knownRefs.add(p.ref); }
  }
}

/** Statements in ({ name, text, folderId?, place? }), docs ({ ref, url }) too; returns how many balances were stored. */
function importStatements({ statements = [], docs = [] }, knownRefs) {
  const db = getDb(); let balances = 0; let skipped = 0;
  const parsed = statements.map((s) => { const p = parse(s.text); return p && { ...p, folderId: s.folderId || null, from: s.place || '' }; });
  const ins = db.prepare('INSERT INTO loan_balances (ref, balance_on, balance_cents, rate_pct) VALUES (?, ?, ?, ?) ON CONFLICT (ref, balance_on) DO UPDATE SET balance_cents = excluded.balance_cents, rate_pct = COALESCE(excluded.rate_pct, rate_pct)');
  const doc = db.prepare('INSERT INTO loan_docs (ref, url) VALUES (?, ?) ON CONFLICT (ref) DO UPDATE SET url = excluded.url');
  db.exec('BEGIN IMMEDIATE');
  try {
    assign(db, parsed.filter(Boolean), knownRefs);
    for (const p of parsed) {
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
