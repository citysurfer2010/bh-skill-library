'use strict';
/**
 * Nur der Web-Eingang darf mit der App sprechen. Die Container der User liegen im selben Netz,
 * ohne dieses Geheimnis könnten sie sich als jemand anderes ausgeben.
 */
const crypto = require('crypto');
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
const fromEdge = (headers) => {
  const secret = process.env.BH_EDGE_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return !!headers['x-edge-secret'] && crypto.timingSafeEqual(hash(secret), hash(headers['x-edge-secret']));
};
const edgeGuard = (req, res, next) => (fromEdge(req.headers) ? next() : res.status(403).json({ error: 'Kein Zugriff' }));
// Apps der User liegen auf Subdomains derselben Website: Schreibzugriffe nur von dieser Seite selbst.
const sameOriginWrites = (req, res, next) => {
  const origin = req.headers.origin;
  if (req.method === 'GET' || !origin) return next();
  try { if (new URL(origin).host === req.headers.host) return next(); } catch { /* ungültig */ }
  return res.status(403).json({ error: 'Fremde Herkunft' });
};
module.exports = { fromEdge, edgeGuard, sameOriginWrites };
