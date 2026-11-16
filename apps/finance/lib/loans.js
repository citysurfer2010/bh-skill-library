'use strict';
/**
 * Loans of the flats (Matti 15.11.2026: "Kredite-Seite"). Amount, balance, annuity and end come from the sheet;
 * interest and repayment per year come from the bank lines that carry the loan's IBAN or account number:
 *   BBBank  "IBAN DE… RECHN.ZINS 123,45 TILG./ENTG. 678,90 TILGUNG PER …"
 *   PSD     "Darl.-Leistung 1234567890 Tilgung 678,90 Zinsen 123,45"
 *   other   "Darlehensrate 123456789012" (no split: counted as rate)
 */
const { getDb } = require('./db');
const statements = require('./loan-statements');
const estateLinks = require('./estate-links');

const num = (s) => (s == null ? 0 : Math.round(Number(String(s).replace(/\./g, '').replace(',', '.')) * 100));
const digits = (s) => String(s || '').replace(/\D/g, '');
/** Account number inside a German IBAN (after bank code), without leading zeros. */
const accountNo = (iban) => { const d = String(iban || '').replace(/\s/g, ''); return /^DE\d{20}$/.test(d) ? d.slice(12).replace(/^0+/, '') : ''; };

/** References and split of one bank line; null when it is no loan payment. */
function parse(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const iban = /IBAN:? ?(DE\d{2}(?: ?\d){18})/.exec(t)?.[1]?.replace(/ /g, '') || '';
  const bb = /RECHN\.ZINS ([\d.]+,\d{2}) TILG\.\/ENTG\. ([\d.]+,\d{2})/.exec(t);
  if (bb) return { refs: [iban, accountNo(iban)].filter(Boolean), interest: num(bb[1]), principal: num(bb[2]) };
  const psd = /Darl\.-Leistung (\d{6,14})/.exec(t);
  if (psd) return { refs: [psd[1].replace(/^0+/, '')], interest: num(/Zinsen ([\d.]+,\d{2})/.exec(t)?.[1]), principal: num(/Tilgung ([\d.]+,\d{2})/.exec(t)?.[1]) };
  const rate = /Darlehensrate (\d{6,14})/.exec(t);
  if (rate) return { refs: [rate[1].replace(/^0+/, '')], interest: 0, principal: 0, rateOnly: true };
  return null;
}

/** Sheet data in, all loans replaced (the sheet is the source). Amounts in euros. */
function importSheet({ asOf, units = [] }) {
  const db = getDb(); const c = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 100));
  const unit = db.prepare('INSERT INTO estate_units (unit_key, address, unit, floor, owner, sqm, market_value_cents, land_charge_cents, rent_year_cents, note, owned_since) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const loan = db.prepare('INSERT INTO loans (unit_key, position, lender, account_iban, amount_cents, balance_cents, annuity_cents, ends_on, rate_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(v || '') ? String(v).slice(0, 10) : null);
  const pct = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? (n < 1 ? Math.round(n * 100000) / 1000 : n) : null; }; // 0.0139 or 1.39 → 1.39
  let n = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM loans; DELETE FROM estate_units');
    for (const u of units) {
      const key = `${u.address} – ${u.unit}`.trim();
      unit.run(key, String(u.address || ''), String(u.unit || ''), String(u.floor || ''), String(u.owner || ''), u.sqm == null || Number.isNaN(Number(u.sqm)) ? null : Number(u.sqm), c(u.market_value), c(u.land_charge), c(u.rent_year), String(u.note || ''), day(u.owned_since));
      for (const l of u.loans || []) {
        if (!(c(l.amount) > 0) && !(c(l.balance) > 0)) continue; // an empty slot of the sheet is no loan
        loan.run(key, l.position, String(l.lender || ''), String(l.account || '').replace(/\s/g, ''), c(l.amount), c(l.balance), c(l.annuity), day(l.ends_on), pct(l.rate)); n += 1;
      }
    }
    db.prepare("INSERT INTO app_state (key, value) VALUES ('loans_as_of', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(asOf || new Date().toISOString().slice(0, 10));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { units: units.length, loans: n };
}

/** Loans with their bank payments per year, totals and the payments no loan could be found for. */
function overview() {
  const db = getDb();
  const loans = db.prepare('SELECT l.*, u.address, u.unit, u.floor, u.owner, u.market_value_cents, r.ref AS found_ref FROM loans l JOIN estate_units u USING (unit_key) LEFT JOIN loan_refs r USING (unit_key, position) ORDER BY u.address, u.unit, l.position').all()
    .filter((l) => l.lender || l.amount_cents > 0 || l.balance_cents > 0) // an empty slot of the sheet is no loan
    .map(({ found_ref: found, ...l }) => ({ ...l, years: {}, last_paid: null, ref: found === '-' ? '' : found || accountNo(l.account_iban) || '', paid: [] }));
  const byRef = new Map(); // The full IBAN only while it is still this loan's account (a corrected sheet account belongs to another loan).
  for (const l of loans) for (const r of [l.ref && accountNo(l.account_iban) === l.ref ? l.account_iban : '', l.ref]) if (r) byRef.set(r, l);
  let unmatched = 0;
  const lines = db.prepare("SELECT booked_on, amount_cents, text FROM transactions WHERE amount_cents < 0 AND (text LIKE '%TILG%' OR text LIKE '%Darl.-Leistung%' OR text LIKE '%Darlehensrate%')").all();
  for (const t of lines) {
    const p = parse(t.text); if (!p) continue;
    const l = p.refs.map((r) => byRef.get(r)).find(Boolean); if (!l) { unmatched += 1; continue; }
    const y = (l.years[t.booked_on.slice(0, 4)] ||= { interest: 0, principal: 0, paid: 0, n: 0 });
    y.interest += p.interest; y.principal += p.principal; y.paid += -t.amount_cents; y.n += 1;
    if (!l.last_paid || t.booked_on > l.last_paid) l.last_paid = t.booked_on;
    l.paid.push({ on: t.booked_on, principal: p.principal });
  }
  // Bank statements: the last balance minus the repayment of the rates since then is today's balance (sheet as fallback).
  for (const l of loans) {
    const s = l.ref ? statements.of(l.ref) : { history: [], rate: null, docs: null };
    const last = s.history.at(-1);
    Object.assign(l, { rate_pct: s.rate ?? l.rate_pct ?? null, rate_source: s.rate != null ? 'bank' : l.rate_pct != null ? 'sheet' : null, docs_url: s.docs || estateLinks.of(l.unit_key).finance_url || null, history: s.history, bank_balance: last || null,
      balance_now_cents: last ? last.cents - l.paid.filter((x) => x.on > last.on).reduce((a, x) => a + x.principal, 0) : l.balance_cents });
    delete l.paid;
  }
  // One loan account for several flats (e.g. one bank loan secured on two flats): the bank's figures are split by the
  // sheet's balance of each part (else its amount, else equally) instead of counting the whole loan twice.
  const groups = new Map(); for (const l of loans) if (l.bank_balance && l.ref) groups.set(l.ref, [...(groups.get(l.ref) || []), l]);
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const w = (l) => l.balance_cents || l.amount_cents || 0; const sumW = g.reduce((s, l) => s + w(l), 0);
    for (const l of g) {
      const f = sumW ? w(l) / sumW : 1 / g.length; const part = (c) => Math.round(c * f);
      Object.assign(l, { balance_now_cents: part(l.balance_now_cents), bank_balance: { ...l.bank_balance, cents: part(l.bank_balance.cents) }, history: l.history.map((h) => ({ ...h, cents: part(h.cents) })), shared: g.length });
    }
  }
  const sum = (k) => loans.reduce((s, l) => s + (l[k] || 0), 0);
  const value = db.prepare('SELECT sum(market_value_cents) AS v FROM estate_units WHERE unit_key IN (SELECT unit_key FROM loans)').get().v || 0;
  const years = {}; for (const l of loans) for (const [y, v] of Object.entries(l.years)) { const s = (years[y] ||= { interest: 0, principal: 0, paid: 0 }); s.interest += v.interest; s.principal += v.principal; s.paid += v.paid; }
  return {
    asOf: db.prepare("SELECT value FROM app_state WHERE key = 'loans_as_of'").get()?.value || null,
    loans: loans.map(({ account_iban, ...l }) => ({ ...l, iban: account_iban ? `…${account_iban.slice(-4)}` : '' })),
    totals: { amount: sum('amount_cents'), balance: sum('balance_now_cents'), annuity: sum('annuity_cents'), marketValue: value },
    years: Object.entries(years).map(([year, v]) => ({ year: Number(year), ...v })).sort((a, b) => b.year - a.year), unmatched,
  };
}

/** Flats with value, rent and the balance of their loans (module Immobilien). */
function estate() {
  const db = getDb();
  const now = new Map(); for (const l of overview().loans) now.set(l.unit_key, (now.get(l.unit_key) || 0) + (l.balance_now_cents || 0));
  const units = db.prepare(`SELECT u.*, (SELECT count(*) FROM loans l WHERE l.unit_key = u.unit_key AND (l.lender != '' OR l.amount_cents > 0 OR l.balance_cents > 0)) AS loans FROM estate_units u ORDER BY u.address, u.unit`).all()
    .map((u) => ({ ...u, balance_cents: u.loans ? now.get(u.unit_key) ?? null : null, ...estateLinks.of(u.unit_key) }));
  const sum = (k) => units.reduce((s, u) => s + (u[k] || 0), 0);
  return { asOf: db.prepare("SELECT value FROM app_state WHERE key = 'loans_as_of'").get()?.value || null, units,
    totals: { units: units.length, sqm: sum('sqm'), marketValue: sum('market_value_cents'), rentYear: sum('rent_year_cents'), balance: sum('balance_cents') } };
}

module.exports = { parse, accountNo, importSheet, overview, estate };
