'use strict';
/**
 * /api/external/finance/*: read-only finance data for the MCP tools (Zottel). Bearer key with scope "finance",
 * which only a person with finance access can create (routes/api-keys.js). Nothing here writes.
 */
const express = require('express');
const { getDb } = require('../lib/db');
const report = require('../lib/report');
const loans = require('../lib/loans');
const accounts = require('../lib/accounts');
const { requireApiKey, requireScope } = require('./external');

const yearOf = (v) => { const y = Number(v); return Number.isInteger(y) && y > 1990 && y < 2100 ? y : new Date().getFullYear(); };

function transactions(q) {
  const all = q.year === 'all'; const y = yearOf(q.year);
  const where = all ? ['1 = 1'] : ['booked_on >= ? AND booked_on < ?']; const args = all ? [] : [`${y}-01-01`, `${y + 1}-01-01`];
  if (q.account) { where.push('account = ?'); args.push(String(q.account)); } else if (q.scope !== 'all') where.push(accounts.HOUSEHOLD);
  if (q.category) { if (q.category === 'OFFEN') where.push('category IS NULL'); else { where.push('category = ?'); args.push(String(q.category)); } }
  const text = String(q.q || '').trim().slice(0, 80);
  if (text) { where.push("(text LIKE ? OR counterparty LIKE ? OR amazon_order IN (SELECT order_id FROM amazon_items WHERE title LIKE ?))"); args.push(`%${text}%`, `%${text}%`, `%${text}%`); }
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  const rows = getDb().prepare(`SELECT t.id, t.booked_on, t.amount_cents, t.counterparty, substr(t.text, 1, 160) AS text, t.account, c.name AS category,
    (SELECT group_concat(title, ' · ') FROM (SELECT title FROM amazon_items i WHERE i.order_id = t.amazon_order ORDER BY title)) AS amazon_items
    FROM transactions t LEFT JOIN categories c ON c.code = t.category WHERE ${where.join(' AND ')} ORDER BY booked_on DESC, id DESC LIMIT ?`).all(...args, limit);
  const sum = getDb().prepare(`SELECT count(*) AS n, sum(amount_cents) AS cents FROM transactions t WHERE ${where.join(' AND ')}`).get(...args);
  return { count: sum.n, sum_cents: sum.cents || 0, shown: rows.length, transactions: rows };
}

function buildRouter() {
  const r = express.Router();
  r.use(requireApiKey, requireScope('finance'));
  r.get('/overview', (req, res) => {
    const o = report.overview(yearOf(req.query.year));
    res.json({ year: o.year, years: o.years, totals: o.totals, arts: o.arts.map(({ art, total, previous }) => ({ art, total, previous })),
      categories: o.categories.map(({ code, name, art, total, count, budget_cents: budget, previous }) => ({ code, name, art, total, count, budget, previous })) });
  });
  r.get('/transactions', (req, res) => res.json(transactions(req.query)));
  r.get('/investments', (req, res) => { const i = report.investments(yearOf(req.query.year)); res.json({ year: i.year, total: i.total, months: i.months, targets: i.targets, perYear: i.perYear }); });
  r.get('/loans', (_req, res) => { const o = loans.overview(); res.json({ ...o, loans: o.loans.map(({ history, ...l }) => ({ ...l, year_end: history.filter((h) => h.on.slice(5) >= '12-28') })) }); });
  r.get('/estate', (_req, res) => res.json(loans.estate()));
  // Money fields get the "_cents" suffix, so the MCP client turns them into euros.
  const MONEY = /^(rent|settlement|energy|broadcast|furnishing|total|perMonth|rentNow|settlementEntered|settlementAverage|cents)$/;
  const cents = (v) => (Array.isArray(v) ? v.map(cents) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [MONEY.test(k) && typeof x === 'number' ? `${k === 'cents' ? 'amount' : k}_cents` : k, cents(x)])) : v);
  r.get('/housing', (_req, res) => res.json(cents(require('../lib/housing').overview())));
  return r;
}

module.exports = { buildRouter, transactions };
