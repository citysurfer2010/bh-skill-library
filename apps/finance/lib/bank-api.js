'use strict';
/**
 * Enable Banking (PSD2 account information). Every call is signed with a short JWT from the app's private key.
 * App id and key come from the platform secrets folder (or env for local runs); without them the bank feature is off.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API = process.env.ENABLE_BANKING_API || 'https://api.enablebanking.com';
const SECRETS = process.env.BANK_SECRETS_DIR || '/etc/devbox/llm';
const CONSENT_DAYS = 179; // Banks allow 180 days; one day less avoids clock edge cases.
let fetchImpl = (...a) => fetch(...a);

function readFile(p) { try { return fs.readFileSync(p, 'utf8').trim(); } catch { return ''; } }
function settings() {
  const appId = process.env.ENABLE_BANKING_APP_ID || readFile(path.join(SECRETS, 'enablebanking-app-id'));
  const key = readFile(process.env.ENABLE_BANKING_KEY_FILE || path.join(SECRETS, 'enablebanking.key'));
  return appId && key ? { appId, key } : null;
}
const configured = () => !!settings();

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function token({ appId, key }) {
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64({ typ: 'JWT', alg: 'RS256', kid: appId })}.${b64({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 600 })}`;
  return `${head}.${crypto.sign('RSA-SHA256', Buffer.from(head), key).toString('base64url')}`;
}

class BankError extends Error {
  constructor(status, message) { super(message); this.status = status; }
  get expired() { return this.status === 401 || this.status === 403 || /expired|revoked|invalid session/i.test(this.message); }
}

async function call(method, url, body, headers = {}) {
  const s = settings();
  if (!s) throw new BankError(503, 'Bankanbindung ist nicht eingerichtet');
  const r = await fetchImpl(`${API}${url}`, {
    method, signal: AbortSignal.timeout(60_000),
    headers: { authorization: `Bearer ${token(s)}`, ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new BankError(r.status, data?.message || data?.error?.message || `Bank antwortet mit ${r.status}`);
  return data;
}

function startAuth({ aspsp, state, redirectUrl }) {
  const validUntil = new Date(Date.now() + CONSENT_DAYS * 86_400_000).toISOString();
  return call('POST', '/auth', { access: { valid_until: validUntil }, aspsp: { name: aspsp, country: 'DE' }, state, redirect_url: redirectUrl, psu_type: 'personal' });
}
const createSession = (code) => call('POST', '/sessions', { code });
/** Product, description and usage (PRIV/ORGA) of one account, e.g. "Mietenkonto - privat" with the flat it belongs to. */
const details = (uid) => call('GET', `/accounts/${encodeURIComponent(uid)}/details`);
/** Balances of one account; banks give several kinds (CLBD booked end of day, ITAV/XPCD available or expected). */
const balances = (uid) => call('GET', `/accounts/${encodeURIComponent(uid)}/balances`);
const deleteSession = (id) => call('DELETE', `/sessions/${encodeURIComponent(id)}`);

/** One page of booked transactions; psuIp marks a request the person started themselves. */
function transactions(uid, { dateFrom, continuation, psuIp } = {}) {
  const q = new URLSearchParams({ transaction_status: 'BOOK' });
  if (dateFrom) q.set('date_from', dateFrom);
  if (continuation) q.set('continuation_key', continuation);
  return call('GET', `/accounts/${encodeURIComponent(uid)}/transactions?${q}`, null, psuIp ? { 'psu-ip-address': psuIp } : {});
}

module.exports = { configured, startAuth, createSession, deleteSession, details, balances, transactions, token, BankError, _setFetch: (f) => { fetchImpl = f; } };
