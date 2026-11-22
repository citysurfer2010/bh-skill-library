'use strict';
/** Evaluations: month by month per kind and category, investments, years on file. */
const { getDb } = require('./db');
const { HOUSEHOLD } = require('./accounts');

const MONTHS = 12;
const years = () => getDb().prepare("SELECT DISTINCT substr(booked_on, 1, 4) AS y FROM transactions ORDER BY y DESC").all().map((r) => Number(r.y));

/** Per category: 12 monthly sums, year sum, previous year sum and budget per month. Open transactions count as "OFFEN". */
function overview(year, today = new Date()) {
  const db = getDb();
  // The running year is compared with the same span of the year before, and averages use the months that have passed.
  const running = year === today.getUTCFullYear(); const elapsed = running ? today.getUTCMonth() + 1 : 12;
  const cut = running ? new Date(Date.UTC(year - 1, today.getUTCMonth(), today.getUTCDate() + 1)).toISOString().slice(0, 10) : `${year}-01-01`;
  const cats = db.prepare('SELECT code, art, name, budget_cents FROM categories').all().map((c) => ({ ...c }));
  const rows = db.prepare(`SELECT COALESCE(category, 'OFFEN') AS code, CAST(substr(booked_on, 6, 2) AS INTEGER) AS m, SUM(amount_cents) AS cents, COUNT(*) AS n FROM transactions WHERE ${HOUSEHOLD} AND booked_on >= ? AND booked_on < ? GROUP BY code, m`)
    .all(`${year}-01-01`, `${year + 1}-01-01`);
  const prev = Object.fromEntries(db.prepare(`SELECT COALESCE(category, 'OFFEN') AS code, SUM(amount_cents) AS cents FROM transactions WHERE ${HOUSEHOLD} AND booked_on >= ? AND booked_on < ? GROUP BY code`)
    .all(`${year - 1}-01-01`, cut).map((r) => [r.code, r.cents]));
  const byCode = new Map(cats.map((c) => [c.code, { ...c, months: Array(MONTHS).fill(0), total: 0, count: 0, previous: prev[c.code] ?? null }]));
  for (const r of rows) {
    if (!byCode.has(r.code)) byCode.set(r.code, { code: r.code, art: r.code === 'OFFEN' ? 'Offen' : 'Unbekannt', name: r.code === 'OFFEN' ? 'Noch nicht zugeordnet' : r.code, budget_cents: null, months: Array(MONTHS).fill(0), total: 0, count: 0, previous: prev[r.code] ?? null });
    const c = byCode.get(r.code); c.months[r.m - 1] += r.cents; c.total += r.cents; c.count += r.n;
  }
  const categories = [...byCode.values()].filter((c) => c.count || c.previous);
  const arts = {};
  for (const c of categories) {
    const a = (arts[c.art] ||= { art: c.art, months: Array(MONTHS).fill(0), total: 0, previous: 0 });
    c.months.forEach((v, i) => { a.months[i] += v; }); a.total += c.total; a.previous += c.previous || 0;
  }
  // Money that really came in from outside or went out: household accounts, transfers between own accounts left out.
  const ext = db.prepare(`SELECT COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents END), 0) AS rein, COALESCE(SUM(CASE WHEN amount_cents < 0 THEN amount_cents END), 0) AS raus FROM transactions
    WHERE ${HOUSEHOLD} AND booked_on >= ? AND booked_on < ? AND (category IS NULL OR category NOT IN (SELECT code FROM categories WHERE art = 'Übertrag'))`).get(`${year}-01-01`, `${year + 1}-01-01`);
  const sum = (art) => arts[art]?.total || 0;
  const income = sum('Einnahmen'); const spending = sum('Ausgaben');
  const invested = -sum('Investment'); const reserved = -sum('Rücklagen');
  return {
    year, years: years(), categories, arts: Object.values(arts), elapsed, previousUntil: running ? cut : null,
    totals: { externIn: ext.rein, externOut: ext.raus, income, spending, result: income + spending, invested, reserved, savingsRate: income > 0 ? Math.round(((invested + reserved) / income) * 1000) / 10 : null, open: categories.find((c) => c.code === 'OFFEN')?.count || 0 },
  };
}

/** Wealth building: money put into investments and reserves, per month and per target, plus the running total over all years. */
function investments(year) {
  const db = getDb();
  const filter = `${HOUSEHOLD} AND category IN (SELECT code FROM categories WHERE art IN ('Investment', 'Rücklagen'))`;
  const months = Array(MONTHS).fill(0);
  for (const r of db.prepare(`SELECT CAST(substr(booked_on, 6, 2) AS INTEGER) AS m, SUM(-amount_cents) AS cents FROM transactions WHERE ${filter} AND booked_on >= ? AND booked_on < ? GROUP BY m`).all(`${year}-01-01`, `${year + 1}-01-01`)) months[r.m - 1] = r.cents;
  const targets = db.prepare(`SELECT counterparty, category, (SELECT name FROM categories WHERE code = category) AS category_name, (SELECT art FROM categories WHERE code = category) AS art, SUM(-amount_cents) AS cents, COUNT(*) AS n, MIN(booked_on) AS first, MAX(booked_on) AS last FROM transactions WHERE ${filter} AND booked_on >= ? AND booked_on < ? GROUP BY counterparty, category ORDER BY cents DESC`).all(`${year}-01-01`, `${year + 1}-01-01`).map((r) => ({ ...r }));
  const perYear = db.prepare(`SELECT substr(booked_on, 1, 4) AS y, SUM(-amount_cents) AS cents FROM transactions WHERE ${filter} GROUP BY y ORDER BY y`).all().map((r) => ({ year: Number(r.y), cents: r.cents }));
  let running = 0;
  return { year, years: years(), months, total: months.reduce((s, v) => s + v, 0), targets, perYear: perYear.map((p) => ({ ...p, cumulative: (running += p.cents) })) };
}

module.exports = { overview, investments, years };
