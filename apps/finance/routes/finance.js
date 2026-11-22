'use strict';
/** Finance API. Private money data: admins always, everyone else only when added to the access list. */
const express = require('express');
const multer = require('multer');
const { getDb } = require('../lib/db');
const report = require('../lib/report');
const ledger = require('../lib/ledger');
const { parseBankFile } = require('../lib/importers');
const accounts = require('../lib/accounts');
const categories = require('../lib/categories');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const yearOf = (v) => { const y = Number(v); return Number.isInteger(y) && y > 1990 && y < 2100 ? y : new Date().getFullYear(); };

const { mayUse, revokeFinanceKeys } = require('../lib/access');
function requireFinance(req, res, next) { return mayUse(req.user) ? next() : res.status(403).json({ error: 'Kein Zugang zu den Finanzen' }); }

// User apps share the site; writes must come from this page.
function sameOrigin(req, res, next) {
  if (req.method === 'GET') return next();
  const origin = req.get('origin');
  if (!origin) return process.env.NODE_ENV === 'production' ? res.status(403).json({ error: 'Herkunft fehlt' }) : next();
  try { if (new URL(origin).host === req.get('host')) return next(); } catch { /* falls through */ }
  return res.status(403).json({ error: 'Falsche Herkunft' });
}

function buildRouter() {
  const r = express.Router();
  r.use(['/overview', '/investments', '/loans', '/estate', '/housing', '/wealth', '/categories', '/transactions', '/imports', '/access', '/accounts'], sameOrigin, requireFinance);
  r.get('/overview', (req, res) => res.json(report.overview(yearOf(req.query.year))));
  r.get('/investments', (req, res) => res.json(report.investments(yearOf(req.query.year))));
  r.get('/loans', (_req, res) => res.json(require('../lib/loans').overview()));
  r.get('/estate', (_req, res) => res.json(require('../lib/loans').estate()));
  r.get('/housing', (_req, res) => res.json(require('../lib/housing').overview()));
  r.get('/wealth', (_req, res) => res.json(require('../lib/wealth').overview()));
  r.post('/wealth/assets', (req, res) => {
    try { require('../lib/wealth').addAsset({ name: req.body?.name, kind: req.body?.kind, value_cents: req.body?.value_cents, as_of: req.body?.as_of, url: req.body?.url }); return res.status(204).end(); } catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
  });
  // Depot export (positions with price and quantity) on the page "Vermögen".
  r.post('/wealth/depot', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Bitte eine Datei wählen' });
    try { return res.json(require('../lib/depot').importDepot(req.file.buffer)); } catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
  });
  r.delete('/wealth/assets/:id', (req, res) => (require('../lib/wealth').removeAsset(req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'Nicht gefunden' })));
  // Expected Nebenkostenabrechnung of a year (negative = back payment, positive = refund, null = use the average).
  r.put('/housing/settlement', (req, res) => {
    const y = Number(req.body?.year); const c = req.body?.cents;
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return res.status(400).json({ error: 'Jahr ungültig' });
    try { require('../lib/housing').setSettlement(y, c == null || c === '' ? null : Math.round(Number(c))); return res.status(204).end(); } catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
  });
  r.get('/categories', (_req, res) => res.json({ categories: getDb().prepare('SELECT * FROM categories ORDER BY art, name').all(), arts: categories.ARTS }));
  const catErr = (res, e) => { if (!e.status) throw e; return res.status(e.status).json({ error: e.message }); };
  r.post('/categories', (req, res) => { try { res.status(201).json({ category: categories.create(req.body || {}) }); } catch (e) { catErr(res, e); } });
  r.patch('/categories/:code', (req, res) => { try { categories.update(req.params.code, req.body || {}); res.status(204).end(); } catch (e) { catErr(res, e); } });

  r.get('/transactions', (req, res) => {
    // year=all: every year at once (e.g. all open lines of one account).
    const y = yearOf(req.query.year); const all = req.query.year === 'all';
    const where = all ? ['1 = 1'] : ['booked_on >= ? AND booked_on < ?']; const args = all ? [] : [`${y}-01-01`, `${y + 1}-01-01`];
    // One account on request; otherwise household accounts only, unless scope=all.
    if (req.query.account) { where.push('account = ?'); args.push(String(req.query.account)); } else if (req.query.scope !== 'all') where.push(accounts.HOUSEHOLD);
    if (req.query.open === '1') where.push('category IS NULL');
    if (req.query.amazon === '1') where.push('amazon_order IS NOT NULL');
    // A split booking (loan rate) is found under each of its parts, e.g. under "Tilgung".
    if (req.query.category) { if (req.query.category === 'OFFEN') where.push('category IS NULL'); else { where.push('(category = ? OR id IN (SELECT transaction_id FROM transaction_splits WHERE category = ?))'); args.push(String(req.query.category), String(req.query.category)); } }
    if (/^\d{1,2}$/.test(String(req.query.month || ''))) { where.push("CAST(substr(booked_on, 6, 2) AS INTEGER) = ?"); args.push(Number(req.query.month)); }
    const rows = getDb().prepare(`SELECT t.*, c.name AS category_name, c.art, (SELECT group_concat(title, ' · ') FROM (SELECT title FROM amazon_items i WHERE i.order_id = t.amazon_order ORDER BY title)) AS amazon_titles, (SELECT -cents FROM transaction_splits s WHERE s.transaction_id = t.id AND s.category = 'TILG') AS repay_cents FROM transactions t LEFT JOIN categories c ON c.code = t.category WHERE ${where.join(' AND ')} ORDER BY booked_on DESC, id DESC`).all(...args);
    res.json({ transactions: rows, years: report.years() });
  });
  // Every transaction has its own address (/finance/transactions/<id>); the page asks here when the id is not in the year shown.
  r.get('/transactions/:id', (req, res) => {
    const t = getDb().prepare('SELECT t.*, c.name AS category_name, c.art FROM transactions t LEFT JOIN categories c ON c.code = t.category WHERE t.id = ?').get(Number(req.params.id));
    return t ? res.json({ transaction: { ...t, amazon_items: require('../lib/amazon').itemsOf(t.amazon_order) } }) : res.status(404).json({ error: 'Buchung nicht gefunden' });
  });
  r.patch('/transactions/:id', (req, res) => {
    try {
      const out = ledger.setCategory(Number(req.params.id), req.body?.category, req.body?.note);
      require('../lib/loan-split').detect(); // a rate moved into or out of "Immobilienkredite" gains or loses its split
      return out ? res.json(out) : res.status(404).json({ error: 'Buchung nicht gefunden' });
    } catch (e) { return res.status(400).json({ error: e.message }); }
  });

  r.get('/imports', (_req, res) => res.json({ imports: getDb().prepare('SELECT i.*, MIN(t.booked_on) AS first, MAX(t.booked_on) AS last FROM imports i LEFT JOIN transactions t ON t.import_id = i.id GROUP BY i.id ORDER BY i.id DESC LIMIT 50').all() }));
  r.post('/imports', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Bitte eine CSV-Datei wählen' });
    // A depot export sent to the transaction import goes to the page "Vermögen" instead of failing.
    if (require('../lib/depot').isDepotExport(req.file.buffer)) {
      try { const d = require('../lib/depot').importDepot(req.file.buffer); return res.json({ depot: true, account: d.label, added: d.positions, duplicates: 0, open: 0, total_cents: d.total_cents, on: d.on }); } catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
    }
    try {
      const parsed = parseBankFile(req.file.buffer, req.body?.account || null);
      const result = ledger.importRows({ filename: req.file.originalname.slice(0, 120), ...parsed, user: req.user.email });
      require('../lib/transfers').detect(); require('../lib/text-rules').detect(); require('../lib/wallets').detect(); require('../lib/loan-split').detect();
      const open = getDb().prepare(`SELECT count(*) AS n FROM transactions WHERE category IS NULL AND ${accounts.HOUSEHOLD}`).get().n;
      return res.status(201).json({ ...result, format: parsed.format, account: parsed.account, rows: parsed.rows.length, open });
    } catch (e) { return res.status(400).json({ error: e.message }); }
  });

  r.get('/accounts', (_req, res) => { const list = accounts.list(); res.json({ accounts: list, scopes: accounts.SCOPES, totals: accounts.totals(list) }); });
  r.patch('/accounts/:name', (req, res) => {
    const name = String(req.params.name);
    try {
      if (req.body?.scope !== undefined) accounts.setScope(name, String(req.body.scope));
      if (req.body?.name !== undefined && !accounts.rename(name, req.body.name, { mergeBank: require('../lib/bank-sync').rename, merge: req.body.merge === true })) return res.status(404).json({ error: 'Konto nicht gefunden' });
      return res.status(204).end();
    } catch (e) { return res.status(e.status || 400).json({ error: e.message, code: e.code }); }
  });
  r.get('/access', (req, res) => res.json({ users: getDb().prepare('SELECT email, added_at FROM access ORDER BY email').all(), admin: req.user.role === 'admin' }));
  r.post('/access', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Nur für Admins' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-Mail ungültig' });
    getDb().prepare('INSERT OR IGNORE INTO access (email, added_by, added_at) VALUES (?, ?, ?)').run(email, req.user.email, new Date().toISOString());
    return res.status(201).json({ email });
  });
  r.delete('/access/:email', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Nur für Admins' });
    const email = String(req.params.email).toLowerCase();
    if (!getDb().prepare('DELETE FROM access WHERE email = ?').run(email).changes) return res.status(404).json({ error: 'Nicht gefunden' });
    revokeFinanceKeys(email); // the person's tools for Zottel lose access with them
    return res.status(204).end();
  });
  return r;
}

module.exports = { buildRouter, mayUse, sameOrigin, requireFinance };
