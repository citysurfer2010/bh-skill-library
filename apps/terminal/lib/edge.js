'use strict';
/**
 * Only the web entry point may talk to the app. User containers sit on the same network;
 * without this secret they could impersonate someone else.
 */
const crypto = require('crypto');
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
const fromEdge = (headers) => {
  const secret = process.env.BH_EDGE_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return !!headers['x-edge-secret'] && crypto.timingSafeEqual(hash(secret), hash(headers['x-edge-secret']));
};
const edgeGuard = (req, res, next) => (fromEdge(req.headers) ? next() : res.status(403).json({ error: 'Kein Zugriff' }));
// User apps live on subdomains of the same site: write access only from this page itself.
const sameOriginWrites = (req, res, next) => {
  const origin = req.headers.origin;
  if (req.method === 'GET' || !origin) return next();
  try { if (new URL(origin).host === req.headers.host) return next(); } catch { /* invalid */ }
  return res.status(403).json({ error: 'Fremde Herkunft' });
};
module.exports = { fromEdge, edgeGuard, sameOriginWrites };
