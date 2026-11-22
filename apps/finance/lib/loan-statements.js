'use strict';
/**
 * Loan statements of the banks: account number, balances, interest rate.
 *   BBBank / PSD  "Kontonummer …", "alter/neuer Kontostand vom DD.MM.YYYY 1.234,56 S", "1,39000% Sollzins(en)", "nomin.Festzinssatz … p.a. 1,23 %"
 *   NordLB / Sparkasse "Darlehen 1234567890, DE…", "Kontostand am DD.MM.YYYY -123.456,78" (Jahresauszug, also from OCR)
 *   Signal Iduna  "IBAN für dieses Konto DE…", "Alter/Neuer Kontostand in EUR am DD.MM.YYYY 123.456,78 -"
 * Each statement gives two balances, so a missing year is covered by the next one's old balance.
 * Only accounts of a known loan are kept; the papers' folder of a loan is stored as a link.
 */
const { getDb } = require('./db');
const { unitsFor, flats } = require('./estate-links');

const cents = (s) => Math.round(Number(String(s).replace(/\./g, '').replace(',', '.')) * 100);
/** Account number inside a German IBAN (same rule as loans.js, kept here to avoid a require cycle). */
const accountNo = (iban) => { const d = String(iban || '').replace(/\s/g, ''); return /^DE\d{20}$/.test(d) ? d.slice(12).replace(/^0+/, '') : ''; };
const iso = (d) => { const [dd, mm, yy] = d.split('.'); return `${yy}-${mm}-${dd}`; };

const num = (m) => (m ? Number(m.replace(',', '.')) : null);
/** Original loan amount when the statement names it; helps to tell several loans of one bank apart. */
const amountOf = (t) => { const m = /(?:Ursprüngliche Darlehenshöhe|Bausparsumme) in EUR[^\n]*\n[^\n]*?([\d.]+,\d{2}) \d+ von \d+/.exec(t) || /(?:Bewilligtes Darlehen EUR:|Ursprungsdarlehen) ?([\d.]+,\d{2})/.exec(t); return m ? cents(m[1]) : null; };

/** { ref, balances: [{ on, cents }], rate, amount, place? } or null when the text is no loan statement. OCR typos ("Kontöstand") are tolerated. */
function parse(text) {
  const t = String(text || '').replace(/[ \t]+/g, ' ').replace(/Kont[öo0]stand/g, 'Kontostand');
  const amount = amountOf(t);
  // Signal Iduna: "IBAN für dieses Konto" then the IBAN; "Alter/Neuer Kontostand in EUR am DD.MM.YYYY 123,45 -" ("-" = debt).
  // OCR leaves noise between label and IBAN (" : ", "= ", a stray digit), so a few non-letters are allowed in between.
  const si = /IBAN für dieses Konto[^A-Za-z]{0,12}?(DE\d{2}(?: ?\d){18})/.exec(t)?.[1];
  if (si && /Kontostand in EUR am/.test(t)) {
    const balances = [...t.matchAll(/(?:Alter|Neuer) Kontostand in EUR am[ .:]*(\d{2}\.\d{2}\.\d{4}) ([\d.]+,\d{2}) ?([-+])?/g)].map((m) => ({ on: iso(m[1]), cents: (m[3] === '+' ? -1 : 1) * cents(m[2]) }));
    return balances.length ? { ref: accountNo(si), balances, rate: null, amount } : null;
  }
  // NordLB / Sparkasse year statement: "Darlehen 1234567890, DE…, place", "Kontostand am DD.MM.YYYY -123.456,78".
  const nord = /Darlehen (\d{8,12}),/.exec(t)?.[1];
  if (nord && /Kontostand am/.test(t)) {
    const place = (/Darlehen \d{8,12}, (?:DE[\d ]{20,30},)?([^\n]*)/.exec(t)?.[1] || '').trim();
    const balances = [...t.matchAll(/Kontostand am (\d{2}\.\d{2}\.\d{4}) (-?[\d.]+,\d{2})/g)].map((m) => ({ on: iso(m[1]), cents: -Math.round(Number(m[2].replace(/\./g, '').replace(',', '.')) * 100) }));
    const rate = /Sollzins(?:satz)?(?: p\.a\.)?:? ([\d]+,\d+) ?%/.exec(t)?.[1];
    return balances.length ? { ref: nord.replace(/^0+/, ''), balances, rate: num(rate), amount, place } : null;
  }
  // BBBank / PSD: "Kontonummer …", "alter/neuer Kontostand vom DD.MM.YYYY 1.234,56 S".
  const ref = /Kontonummer (\d{6,12})/.exec(t)?.[1];
  if (!ref || !/Kontostand/.test(t)) return null;
  const balances = [];
  for (const m of t.matchAll(/(?:alter|neuer) Kontostand vom (\d{2}\.\d{2}\.\d{4}) ([\d.]+,\d{2}) ?([SH])/g)) balances.push({ on: iso(m[1]), cents: (m[3] === 'S' ? 1 : -1) * cents(m[2]) });
  const rate = /([\d]+,\d+)% Sollzins/.exec(t)?.[1] || /Festzinssatz.*?p\.a\. ([\d]+,\d+) ?%/.exec(t)?.[1];
  return balances.length ? { ref: ref.replace(/^0+/, ''), balances, rate: num(rate), amount } : null;
}

/**
 * One PDF can hold several statements (Signal Iduna sends one per sub-account, "…-00", "…-01"); each starts with
 * "IBAN für dieses Konto". Read every part on its own, else all balances land on the first account (22.11.2026: the
 * small loan's balance overwrote the main loan of a flat, ~370.000 € too little debt).
 */
function parseAll(text) {
  const t = String(text || ''); const at = [...t.matchAll(/IBAN für dieses Konto/g)].map((m) => m.index);
  if (at.length < 2) return [parse(t)].filter(Boolean);
  return at.map((i, k) => parse(t.slice(i, at[k + 1] ?? t.length))).filter(Boolean);
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
  const put = db.prepare('INSERT OR REPLACE INTO loan_refs (unit_key, position, ref) VALUES (?, ?, ?)');
  const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
  // The sheet may name an account at the wrong one of several loans of the same bank (Matti 16.11.2026: two NordLB loans
  // together for two flats). When the statement's granted amount contradicts that loan but fits exactly one other loan
  // of the same bank for the same flats, the account moves there; the first loan is marked "-" (sheet account wrong).
  const all = db.prepare('SELECT l.*, r.ref AS known_ref FROM loans l LEFT JOIN loan_refs r USING (unit_key, position)').all();
  for (const p of parsed.filter((x) => knownRefs.has(x.ref) && x.amount)) {
    const wrong = all.find((l) => !l.known_ref && accountNo(l.account_iban) === p.ref);
    if (!wrong || near(wrong.amount_cents, p.amount, Math.max(100, p.amount * 0.05))) continue;
    const keys = new Set([wrong.unit_key, ...units(p)]);
    const right = all.filter((l) => l !== wrong && keys.has(l.unit_key) && l.lender === wrong.lender && near(l.amount_cents, p.amount, Math.max(100, p.amount * 0.05)) && (!l.known_ref || l.known_ref === '-'));
    if (right.length !== 1) continue;
    put.run(right[0].unit_key, right[0].position, p.ref); put.run(wrong.unit_key, wrong.position, '-');
    right[0].known_ref = p.ref; wrong.known_ref = '-';
  }
  for (const p of parsed.filter((x) => !knownRefs.has(x.ref))) {
    const keys = units(p); if (!keys.length) continue;
    const inFolder = db.prepare(`SELECT l.*, r.ref AS known_ref FROM loans l LEFT JOIN loan_refs r USING (unit_key, position) WHERE l.unit_key IN (${keys.map(() => '?').join(',')})`).all(...keys);
    const known = new Set(parsed.filter((x) => knownRefs.has(x.ref) && units(x).some((k) => keys.includes(k))).map((x) => x.ref));
    const banks = new Set(inFolder.filter((l) => known.has(accountNo(l.account_iban)) || known.has(l.known_ref)).map((l) => l.lender));
    const free = inFolder.filter((l) => (!l.account_iban || l.known_ref === '-') && (!l.known_ref || l.known_ref === '-') && banks.has(l.lender));
    // The statement's original amount must fit (5 % room for rounded sheet values); among several loans of that bank it
    // decides to the euro. Nothing is guessed.
    const fits = (l, tol) => !p.amount || l.amount_cents == null || Math.abs(l.amount_cents - p.amount) <= tol;
    const pick = free.length === 1 ? free.filter((l) => fits(l, Math.max(100, p.amount * 0.05))) : p.amount ? free.filter((l) => l.amount_cents != null && fits(l, 100)) : [];
    if (pick.length === 1) { (pick[0].known_ref === '-' ? put : add).run(pick[0].unit_key, pick[0].position, p.ref); pick[0].known_ref = p.ref; knownRefs.add(p.ref); }
  }
}

/** Statements in ({ name, text, folderId?, place? }), docs ({ ref, url }) too; returns how many balances were stored. */
function importStatements({ statements = [], docs = [] }, knownRefs) {
  const db = getDb(); let balances = 0; let skipped = 0;
  const parsed = statements.flatMap((s) => parseAll(s.text).map((p) => ({ ...p, folderId: s.folderId || null, from: s.place || '' })));
  const ins = db.prepare('INSERT INTO loan_balances (ref, balance_on, balance_cents, rate_pct) VALUES (?, ?, ?, ?) ON CONFLICT (ref, balance_on) DO UPDATE SET balance_cents = excluded.balance_cents, rate_pct = COALESCE(excluded.rate_pct, rate_pct)');
  const doc = db.prepare('INSERT INTO loan_docs (ref, url) VALUES (?, ?) ON CONFLICT (ref) DO UPDATE SET url = excluded.url');
  db.exec('BEGIN IMMEDIATE');
  try {
    assign(db, parsed.filter(Boolean), knownRefs);
    // A header naming several flats ("WE30,31") marks a loan shared by them (Matti 16.11.2026); one flat number never does.
    const share = db.prepare('INSERT OR IGNORE INTO loan_shares (ref, unit_key) VALUES (?, ?)');
    for (const p of parsed) {
      if (!p || !knownRefs.has(p.ref)) continue;
      const place = [p.place, p.from].find((s) => flats(s).size >= 2); if (!place) continue;
      const keys = unitsFor(place); if (keys.length < 2) continue;
      db.prepare('DELETE FROM loan_shares WHERE ref = ?').run(p.ref); for (const k of keys) share.run(p.ref, k);
    }
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

module.exports = { parse, parseAll, importStatements, of };
