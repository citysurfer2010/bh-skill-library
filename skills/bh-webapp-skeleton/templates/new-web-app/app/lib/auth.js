'use strict';
/**
 * Wer angemeldet ist, sagt der BH-Auth-Proxy per Kopfzeilen. Vertraut wird ihnen nur mit TRUST_PROXY_AUTH=1,
 * also nur, wenn die App ausschließlich hinter dem Proxy erreichbar ist. Sonst zählen nur DEV_USER_EMAIL und DEV_USER_ROLE.
 * Ohne gültige E-Mail gibt es keinen Benutzer; eine unbekannte Rolle ist "user".
 */
const { sendError } = require('./error-page');

const ROLES = ['user', 'admin'];
const EMAIL = /^[^\s@]+@[^\s@]+$/;

const normalRole = (role) => {
  const r = String(role || '').trim();
  return ROLES.includes(r) ? r : 'user';
};

function currentUser(req, _res, next) {
  const trusted = process.env.TRUST_PROXY_AUTH === '1';
  const rawEmail = trusted ? req.get('x-user-email') : process.env.DEV_USER_EMAIL;
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!EMAIL.test(email)) {
    req.user = null;
    return next();
  }
  const role = trusted ? req.get('x-user-role') : process.env.DEV_USER_ROLE;
  const name = trusted ? String(req.get('x-user-name') || '').trim() : '';
  req.user = { email, name: name || email, role: normalRole(role) };
  return next();
}

function requireUser(req, res, next) {
  if (!req.user) return sendError(req, res, { status: 401, message: 'Nicht angemeldet' });
  return next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return sendError(req, res, { status: 401, message: 'Nicht angemeldet' });
    if (req.user.role !== role) return sendError(req, res, { status: 403, message: 'Keine Berechtigung' });
    return next();
  };
}

module.exports = { ROLES, currentUser, requireUser, requireRole };
