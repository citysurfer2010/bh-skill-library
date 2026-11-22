'use strict';
/** Bank connection (Enable Banking): connect, consent callback, fetch now, rename and remove accounts. Same access as the finances. */
const express = require('express');
const sync = require('../lib/bank-sync');
const accounts = require('../lib/accounts');
const { getDb } = require('../lib/db');

const APP_BASE = '/finance';
// Must equal the redirect URL registered at Enable Banking.
// Where the bank sends the browser back: from the environment, else from the request's own origin (no domain in the code).
const REDIRECT = process.env.BANK_REDIRECT_URL || '';
const redirectFor = (req) => REDIRECT || `${req.get('origin') || `${req.protocol}://${req.get('host')}`}/finance/api/bank/callback`;
const psuIp = (req) => String(req.get('x-forwarded-for') || req.get('x-real-ip') || req.ip || '').split(',')[0].trim() || undefined;
const fail = (res, e) => res.status(e.status && e.status < 500 ? e.status : 502).json({ error: e.message, code: e.code });

function buildRouter({ sameOrigin, requireFinance }) {
  const r = express.Router();
  r.use(sameOrigin, requireFinance);
  r.get('/status', (_req, res) => res.json(sync.status()));
  r.post('/connect', async (req, res) => {
    try { return res.json({ url: await sync.connect({ aspsp: String(req.body?.aspsp || ''), user: req.user.email, redirectUrl: redirectFor(req) }) }); } catch (e) { return fail(res, e); }
  });
  // The bank sends the browser back here; the first fetch runs at once while the bank login is fresh.
  r.get('/callback', async (req, res) => {
    const back = (q) => res.redirect(303, `${APP_BASE}/import?${new URLSearchParams(q)}`);
    if (req.query.error) return back({ bank: 'error', reason: String(req.query.error).slice(0, 60) });
    try {
      const { aspsp, accounts } = await sync.finish({ code: req.query.code, state: req.query.state, user: req.user.email });
      sync.syncAll({ force: true, psuIp: psuIp(req) }).catch((e) => console.error('[bank] Abruf nach Verbinden:', e.message));
      return back({ bank: 'ok', aspsp, accounts: String(accounts.length) });
    } catch (e) { return back({ bank: 'error', reason: e.message.slice(0, 200) }); }
  });
  r.post('/sync', async (req, res) => {
    try { return res.json({ results: await sync.syncAll({ force: true, psuIp: psuIp(req) }) }); } catch (e) { return fail(res, e); }
  });
  r.patch('/accounts/:uid', (req, res) => {
    const acc = getDb().prepare('SELECT label FROM bank_accounts WHERE uid = ?').get(req.params.uid);
    if (!acc) return res.status(404).json({ error: 'Konto nicht gefunden' });
    try { accounts.rename(acc.label, req.body?.label, { mergeBank: sync.rename, merge: req.body?.merge === true }); return res.status(204).end(); } catch (e) { return fail(res, e); }
  });
  r.delete('/accounts/:uid', async (req, res) => (await sync.disconnect(req.params.uid) ? res.status(204).end() : res.status(404).json({ error: 'Konto nicht gefunden' })));
  return r;
}

/** Daily fetch: checks every hour, each account is fetched at most every 20 hours. Only in the running app, never in tests. */
function startSchedule() {
  if (process.env.BANK_SCHEDULE === '0' || !require('../lib/bank-api').configured()) return null;
  const tick = () => sync.syncAll().then((out) => out.filter((o) => !o.skipped).forEach((o) => console.log(`[bank] ${o.label}: ${o.error ? `Fehler ${o.error}` : `${o.added} neu, ${o.linked} verknüpft`}`))).catch((e) => console.error('[bank]', e.message));
  setTimeout(tick, 120_000).unref();
  return setInterval(tick, 3600_000).unref();
}

module.exports = { buildRouter, startSchedule, REDIRECT };
