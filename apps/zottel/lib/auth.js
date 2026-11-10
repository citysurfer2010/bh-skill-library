'use strict';

// The login service sends names URL-encoded so that umlauts survive in headers.
function decodeName(v) { try { return v ? decodeURIComponent(v) : v; } catch { return v; } }
/**
 * The BH auth proxy says who is logged in via headers. They are trusted only with TRUST_PROXY_AUTH=1,
 * i.e. only if the app is reachable exclusively behind the proxy. Otherwise only DEV_USER_EMAIL and DEV_USER_ROLE count.
 * Without a valid email there is no user; an unknown role is "user".
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
  const name = trusted ? String(decodeName(req.get('x-user-name')) || '').trim() : '';
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
