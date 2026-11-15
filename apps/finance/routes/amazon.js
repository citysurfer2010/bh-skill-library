'use strict';
/** Amazon connection: login dialogue (password passed through, never stored or logged), fetch now, disconnect. */
const express = require('express');
const amazon = require('../lib/amazon');
const api = require('../lib/amazon-api');

const fail = (res, e) => res.status(e.status && e.status < 500 ? e.status : 502).json({ error: e.message, code: e.code });

function buildRouter({ sameOrigin, requireFinance }) {
  const r = express.Router();
  r.use(sameOrigin, requireFinance);
  r.get('/orders', (req, res) => res.json(require('../lib/amazon-orders').list({ year: /^\d{4}$/.test(req.query.year || '') ? req.query.year : 'all', q: String(req.query.q || '').slice(0, 80), category: String(req.query.category || ''), link: ['mit', 'ohne'].includes(req.query.link) ? req.query.link : '' })));
  r.get('/status', async (_req, res) => {
    const s = amazon.status();
    if (s.configured) Object.assign(s, await api.status().then((x) => ({ connected: x.connected, stored: !!x.stored })).catch(() => ({ connected: null, stored: false })));
    res.json(s);
  });
  r.post('/login', async (req, res) => {
    const email = String(req.body?.email || '').trim(); const password = String(req.body?.password || '');
    // Empty: the worker uses the access stored in the .env (BH_AMAZON_EMAIL / BH_AMAZON_PASSWORD).
    if (Boolean(email) !== Boolean(password)) return res.status(400).json({ error: 'E-Mail und Passwort angeben' });
    try { return res.json(await api.login(email || undefined, password || undefined)); } catch (e) { return fail(res, e); }
  });
  r.post('/login/answer', async (req, res) => {
    try { return res.json(await api.answer({ code: req.body?.code ? String(req.body.code).trim() : undefined, captcha: req.body?.captcha ? String(req.body.captcha).trim() : undefined })); } catch (e) { return fail(res, e); }
  });
  r.post('/logout', async (_req, res) => { try { return res.json(await api.logout()); } catch (e) { return fail(res, e); } });
  // The first fetch reads back to 2021 and takes minutes, so it runs in the background; the page asks /status.
  r.post('/sync', (_req, res) => {
    amazon.sync({ force: true }).catch((e) => console.error('[amazon]', e.message));
    res.status(202).json({ started: true });
  });
  return r;
}

/** Daily: checks hourly, fetches at most every 20 hours, only while connected. Never in tests. */
function startSchedule() {
  if (process.env.BANK_SCHEDULE === '0' || !api.configured()) return null;
  const tick = () => api.status().then((s) => (s.connected ? amazon.sync() : null))
    .then((r) => r && !r.skipped && console.log(`[amazon] ${r.added} neue Zahlungen, ${r.items} Artikel, ${r.linked.byText + r.linked.byAmount} Buchungen zugeordnet`))
    .catch((e) => console.error('[amazon]', e.message));
  setTimeout(tick, 180_000).unref();
  return setInterval(tick, 3600_000).unref();
}

module.exports = { buildRouter, startSchedule };
