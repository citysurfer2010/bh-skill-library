'use strict';
/** Finance API. Private money data: admins always, everyone else only when added to the access list. */
const express = require('express');
const multer = require('multer');
const { getDb } = require('../lib/db');
const report = require('../lib/report');
const ledger = require('../lib/ledger');
const { parseBankFile } = require('../lib/importers');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const yearOf = (v) => { const y = Number(v); return Number.isInteger(y) && y > 1990 && y < 2100 ? y : new Date().getFullYear(); };

function mayUse(user) {
  return !!user && (user.role === 'admin' || !!getDb().prepare('SELECT 1 FROM access WHERE email = ?').get(user.email));
}
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
  r.use(['/overview', '/investments', '/categories', '/transactions', '/imports', '/access'], sameOrigin, requireFinance);
  r.get('/overview', (req, res) => res.json(report.overview(yearOf(req.query.year))));
  r.get('/investments', (req, res) => res.json(report.investments(yearOf(req.query.year))));
  r.get('/categories', (_req, res) => res.json({ categories: getDb().prepare('SELECT * FROM categories ORDER BY art, name').all() }));
  r.patch('/categories/:code', (req, res) => {
    const b = req.body?.budget_cents; const budget = b === null || b === '' ? null : Math.round(Number(b));
    if (budget !== null && !Number.isFinite(budget)) return res.status(400).json({ error: 'Budget ungültig' });
    return getDb().prepare('UPDATE categories SET budget_cents = ? WHERE code = ?').run(budget, req.params.code).changes ? res.status(204).end() : res.status(404).json({ error: 'Kategorie nicht gefunden' });
  });

  r.get('/transactions', (req, res) => {
    const y = yearOf(req.query.year); const where = ['booked_on >= ? AND booked_on < ?']; const args = [`${y}-01-01`, `${y + 1}-01-01`];
    if (req.query.open === '1') where.push('category IS NULL');
    if (req.query.category) { where.push(req.query.category === 'OFFEN' ? 'category IS NULL' : 'category = ?'); if (req.query.category !== 'OFFEN') args.push(String(req.query.category)); }
    if (/^\d{1,2}$/.test(String(req.query.month || ''))) { where.push("CAST(substr(booked_on, 6, 2) AS INTEGER) = ?"); args.push(Number(req.query.month)); }
    const rows = getDb().prepare(`SELECT t.*, c.name AS category_name, c.art FROM transactions t LEFT JOIN categories c ON c.code = t.category WHERE ${where.join(' AND ')} ORDER BY booked_on DESC, id DESC`).all(...args);
    res.json({ transactions: rows, years: report.years() });
  });
  r.patch('/transactions/:id', (req, res) => {
    try {
      const out = ledger.setCategory(Number(req.params.id), req.body?.category, req.body?.note);
      return out ? res.json(out) : res.status(404).json({ error: 'Buchung nicht gefunden' });
    } catch (e) { return res.status(400).json({ error: e.message }); }
  });

  r.get('/imports', (_req, res) => res.json({ imports: getDb().prepare('SELECT i.*, MIN(t.booked_on) AS first, MAX(t.booked_on) AS last FROM imports i LEFT JOIN transactions t ON t.import_id = i.id GROUP BY i.id ORDER BY i.id DESC LIMIT 50').all() }));
  r.post('/imports', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Bitte eine CSV-Datei wählen' });
    try {
      const parsed = parseBankFile(req.file.buffer, req.body?.account || null);
      const result = ledger.importRows({ filename: req.file.originalname.slice(0, 120), ...parsed, user: req.user.email });
      const open = getDb().prepare('SELECT count(*) AS n FROM transactions WHERE category IS NULL').get().n;
      return res.status(201).json({ ...result, format: parsed.format, account: parsed.account, rows: parsed.rows.length, open });
    } catch (e) { return res.status(400).json({ error: e.message }); }
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
    return getDb().prepare('DELETE FROM access WHERE email = ?').run(String(req.params.email).toLowerCase()).changes ? res.status(204).end() : res.status(404).json({ error: 'Nicht gefunden' });
  });
  return r;
}

module.exports = { buildRouter, mayUse };
