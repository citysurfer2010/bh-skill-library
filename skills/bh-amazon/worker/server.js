'use strict';
/**
 * bh-amazon worker: a headless browser holding the family's Amazon session. Reachable only inside bh-apps-net,
 * every call carries the shared key from /run/bh-amazon/token. Read only: it never orders or changes anything.
 */
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const login = require('./lib/login');
const fetcher = require('./lib/fetch');
const { hasSession, forget } = require('./lib/session');

const PORT = Number(process.env.PORT || 3800);
const TOKEN = (() => { try { return fs.readFileSync(process.env.TOKEN_FILE || '/run/bh-amazon/token', 'utf8').trim(); } catch { return ''; } })();
let busy = Promise.resolve();
const serial = (fn) => { const run = busy.then(fn, fn); busy = run.catch(() => {}); return run; }; // one browser action at a time

const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function send(res, status, body) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
async function body(req) { let s = ''; for await (const c of req) { s += c; if (s.length > 1e5) throw new Error('zu groß'); } return s ? JSON.parse(s) : {}; }

const routes = {
  'GET /health': async () => ({ ok: true }),
  'GET /status': async () => ({ connected: hasSession() }),
  'POST /login': async (b) => serial(() => login.start({ email: String(b.email || ''), password: String(b.password || '') })),
  'POST /login/answer': async (b) => serial(() => login.answer({ code: b.code, captcha: b.captcha })),
  'POST /logout': async () => { forget(); return { connected: false }; },
  'POST /payments': async (b) => serial(() => fetcher.payments({ since: /^\d{4}-\d{2}-\d{2}$/.test(b.since || '') ? b.since : undefined })),
  'POST /items': async (b) => serial(() => fetcher.items([].concat(b.orderIds || []).filter((x) => /^\d{3}-\d{7}-\d{7}$/.test(x)))),
};

http.createServer(async (req, res) => {
  const key = `${req.method} ${req.url.split('?')[0]}`;
  if (key === 'GET /health') return send(res, 200, { ok: true });
  if (!TOKEN || !same(String(req.headers.authorization || ''), `Bearer ${TOKEN}`)) return send(res, 401, { error: 'Schlüssel fehlt oder falsch' });
  const fn = routes[key]; if (!fn) return send(res, 404, { error: 'unbekannt' });
  try { return send(res, 200, await fn(await body(req))); } catch (e) {
    return send(res, e.code === 'login' ? 409 : 502, { error: e.message, code: e.code || 'error' });
  }
}).listen(PORT, '0.0.0.0', () => console.log(`[bh-amazon] läuft auf Port ${PORT}`));
