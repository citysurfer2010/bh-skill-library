'use strict';
/**
 * Net worth over time (22.11.2026: "Vermögen über die Zeit: Wohnungen zum Marktwert minus Restschuld plus Depot plus
 * Konten"). Per month end:
 *  - flats: today's market value of each flat owned by then ("Besitzer seit"); there is no value history yet
 *  - debt: per loan from its statements (year ends, payout, payoff), linearly between them, today's balance after the
 *    last one, the first statement's balance before it (a loan paid out later gets a statement of 0 before its payout;
 *    an interest-only loan's statements equal its amount, so "first statement = amount" says nothing about the payout)
 *  - accounts (private and the flats' accounts; trust accounts belong to the tenants): today's bank balance minus the
 *    bookings after the month end; an account counts only from its first booking on
 *  - depot and other assets: values entered on the page (wealth_assets), each entry a point in time
 */
const { getDb } = require('./db');
const accounts = require('./accounts');
const loans = require('./loans');

const iso = (d) => d.toISOString().slice(0, 10);
const monthEnds = (from, to) => { const out = []; for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0)); d <= to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0))) out.push(iso(d)); return out; };
const KINDS = ['Depot', 'Bausparvertrag', 'Beteiligung', 'Versicherung', 'Sonstiges'];

/**
 * A purchase loan (the flat's loans together at least half its value) is paid out in parts after the flat is taken over (e.g. by
 * construction progress); until the statement with the highest balance the purchase price is still owed, so from
 * "Besitzer seit" on it counts with its full amount (22.11.2026: else the net worth jumped by the open purchase price).
 */
function debtAt(l, on, today, ctx = {}) {
  const raw = rawDebt(l, on, today);
  const { ownedSince, value, groupAmount } = ctx;
  if (!ownedSince || on < ownedSince || !l.amount_cents || !value || (groupAmount || l.amount_cents) < value * 0.5) return raw;
  // Fully paid out at the statement with the highest balance (later ones only go down by repayment).
  const hist = [...(l.history || [])].sort((x, y) => x.on.localeCompare(y.on)); const top = hist.reduce((m, h) => (!m || h.cents > m.cents ? h : m), null);
  return top && on >= top.on ? raw : Math.max(raw, l.amount_cents);
}

function rawDebt(l, on, today) {
  const pts = [...(l.history || [])].sort((a, b) => a.on.localeCompare(b.on));
  if (!pts.length) return l.balance_now_cents ?? l.balance_cents ?? 0;
  if (on < pts[0].on) return pts[0].cents;
  const last = pts.at(-1);
  if (on >= last.on) {
    const now = l.balance_now_cents ?? last.cents;
    if (on >= today || last.on >= today) return now;
    const t = (Date.parse(on) - Date.parse(last.on)) / (Date.parse(today) - Date.parse(last.on));
    return Math.round(last.cents + (now - last.cents) * t);
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]; const b = pts[i + 1];
    if (on >= a.on && on <= b.on) return Math.round(a.cents + (b.cents - a.cents) * ((Date.parse(on) - Date.parse(a.on)) / (Date.parse(b.on) - Date.parse(a.on) || 1)));
  }
  return last.cents;
}

function overview(today = new Date()) {
  const db = getDb(); const now = iso(today);
  const list = accounts.list().filter((a) => a.scope !== 'treuhand');
  const withBalance = list.filter((a) => a.balance != null);
  const after = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions WHERE account = ? AND booked_on > ?');
  const ln = loans.overview().loans;
  const units = db.prepare('SELECT unit_key, market_value_cents AS v, owned_since FROM estate_units').all();
  const unitBy = new Map(units.map((u) => [u.unit_key, u]));
  const ctxOf = (l) => { const keys = l.shared_units?.length ? l.shared_units : [l.unit_key]; const us = keys.map((k) => unitBy.get(k)).filter(Boolean); return { ownedSince: us.map((u) => u.owned_since).filter(Boolean).sort()[0], value: us.reduce((s, u) => s + (u.v || 0), 0), groupAmount: ln.filter((x) => x.unit_key === l.unit_key && x.lender === l.lender).reduce((s, x) => s + (x.amount_cents || 0), 0) }; };
  const assets = db.prepare('SELECT id, name, kind, value_cents, as_of FROM wealth_assets ORDER BY name, as_of').all();
  const firstOf = Object.fromEntries(withBalance.map((a) => [a.name, a.first || now]));
  // From the first month all accounts with a balance have bookings (before that a flat account is simply unknown).
  // Without any bank balance (e.g. a fresh install) the last 24 months are shown.
  const start = withBalance.length ? Object.values(firstOf).reduce((m, d) => (d > m ? d : m), '2000-01-01') : iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 23, 1)));
  const ends = monthEnds(new Date(`${start}T12:00:00Z`), today); if (ends.at(-1) !== now) ends.push(now);
  const point = (on) => {
    const estate = units.reduce((s, u) => s + (!u.owned_since || u.owned_since <= on ? u.v || 0 : 0), 0);
    const debt = ln.reduce((s, l) => s + debtAt(l, on, now, ctxOf(l)), 0);
    const cash = { haushalt: 0, immobilien: 0 };
    for (const a of withBalance) if (firstOf[a.name] <= on) cash[a.scope] = (cash[a.scope] || 0) + a.balance - after.get(a.name, on).s;
    const latest = new Map(); for (const x of assets) if (x.as_of <= on) latest.set(x.name, x.value_cents);
    const other = [...latest.values()].reduce((s, v) => s + v, 0);
    return { on, estate, debt, cash_private: cash.haushalt, cash_property: cash.immobilien, other, net: estate - debt + cash.haushalt + cash.immobilien + other };
  };
  const months = ends.map(point);
  const current = new Map(); for (const x of assets) current.set(x.name, x);
  return {
    asOf: now, start, months, now: months.at(-1), kinds: KINDS,
    assets: [...current.values()].map((x) => ({ ...x, history: assets.filter((y) => y.name === x.name).map((y) => ({ id: y.id, on: y.as_of, cents: y.value_cents })) })),
    missing: list.filter((a) => a.balance == null).map((a) => a.name),
  };
}

/** A value of a depot or other asset at a date (a new point; the same name and date replaces the value). */
function addAsset({ name, kind, value_cents: cents, as_of: on }) {
  const n = String(name || '').trim().slice(0, 80);
  if (!n) throw Object.assign(new Error('Name fehlt'), { status: 400 });
  if (!KINDS.includes(kind)) throw Object.assign(new Error('Art unbekannt'), { status: 400 });
  if (!Number.isInteger(cents) || cents < 0) throw Object.assign(new Error('Wert ungültig'), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(on || ''))) throw Object.assign(new Error('Datum ungültig'), { status: 400 });
  getDb().prepare('INSERT INTO wealth_assets (name, kind, value_cents, as_of, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (name, as_of) DO UPDATE SET kind = excluded.kind, value_cents = excluded.value_cents').run(n, kind, cents, on, new Date().toISOString());
}
function removeAsset(id) { return getDb().prepare('DELETE FROM wealth_assets WHERE id = ?').run(Number(id)).changes; }

module.exports = { overview, addAsset, removeAsset, debtAt, KINDS };
