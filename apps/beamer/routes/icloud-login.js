'use strict';
/** Owner-only door to the login page of the iCloud photo sync. The Apple password passes straight through and is never stored here. */
const http = require('http');
const bridge = require('../lib/menu-bridge');

const PREFIX = '/beamer/icloud-login';
const UPSTREAM_TIMEOUT_MS = 60_000;
const FORWARDED_REQUEST = ['accept', 'content-type', 'content-length', 'hx-request', 'hx-current-url', 'hx-target', 'hx-trigger'];
const THIRD_PARTY_CSS = /<link[^>]+cdn\.jsdelivr\.net[^>]*>/g;

const upstream = () => ({ host: process.env.BH_ICLOUD_LOGIN_HOST || 'bh-icloud-photos', port: Number(process.env.BH_ICLOUD_LOGIN_PORT) || 8080 });

/** The page uses absolute paths; below the app's path they must carry the prefix. */
const rewriteHtml = (html) => html.replace(THIRD_PARTY_CSS, '').replace(/(=\s*["'])\/(?!\/)/g, `$1${PREFIX}/`);

function sameOrigin(req) {
  try { return new URL(req.get('origin')).host === req.get('host'); } catch { return false; }
}

function requireOwner(req, res, next) {
  if (!bridge.isWorkOwner(req.user?.email)) return res.status(403).json({ error: 'Keine Berechtigung' });
  if (!['GET', 'HEAD'].includes(req.method) && !sameOrigin(req)) return res.status(403).json({ error: 'Fremde Herkunft' });
  return next();
}

function proxy(req, res) {
  const headers = {};
  for (const h of FORWARDED_REQUEST) if (req.headers[h]) headers[h] = req.headers[h];
  const up = http.request({ ...upstream(), method: req.method, path: req.url, headers, timeout: UPSTREAM_TIMEOUT_MS }, (r) => {
    const type = r.headers['content-type'] || 'application/octet-stream';
    res.status(r.statusCode).set({ 'content-type': type, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
    for (const [k, v] of Object.entries(r.headers)) if (k.startsWith('hx-')) res.set(k, v);
    if (!type.includes('text/html')) { r.pipe(res); return; }
    const parts = [];
    r.on('data', (c) => parts.push(c));
    r.on('end', () => res.send(rewriteHtml(Buffer.concat(parts).toString('utf8'))));
  });
  const unavailable = () => { if (!res.headersSent) res.status(502).json({ error: 'Der Foto-Abgleich läuft gerade nicht' }); };
  up.on('timeout', () => up.destroy(new Error('timeout')));
  up.on('error', unavailable);
  req.pipe(up);
}

module.exports = { requireOwner, proxy, rewriteHtml };
