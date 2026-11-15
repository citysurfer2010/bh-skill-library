'use strict';
/** Client of the bh-amazon worker (skills/bh-amazon). Without its key the Amazon feature is off. */
const fs = require('fs');
const path = require('path');

const BASE = process.env.AMAZON_URL || 'http://bh-amazon:3800';
const KEY_FILE = process.env.AMAZON_TOKEN_FILE || path.join(process.env.BANK_SECRETS_DIR || '/etc/devbox/llm', 'amazon-token');
let fetchImpl = (...a) => fetch(...a);

const token = () => { try { return fs.readFileSync(KEY_FILE, 'utf8').trim(); } catch { return ''; } };
const configured = () => !!token();

async function call(method, url, body, timeoutMs = 120_000) {
  const t = token();
  if (!t) throw Object.assign(new Error('Amazon-Abruf ist nicht eingerichtet'), { status: 503 });
  let r;
  try {
    r = await fetchImpl(`${BASE}${url}`, { method, signal: AbortSignal.timeout(timeoutMs), headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { throw Object.assign(new Error('Amazon-Dienst nicht erreichbar'), { status: 502, cause: e }); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Amazon-Dienst antwortet mit ${r.status}`), { status: r.status, code: data.code });
  return data;
}

module.exports = {
  configured,
  status: () => call('GET', '/status'),
  login: (email, password) => call('POST', '/login', { email, password }),
  answer: (a) => call('POST', '/login/answer', a),
  logout: () => call('POST', '/logout'),
  payments: (since) => call('POST', '/payments', { since }, 30 * 60_000),
  orders: (since, stopAt) => call('POST', '/orders', { since, stopAt }, 60 * 60_000),
  items: (orderIds) => call('POST', '/items', { orderIds }, 20 * 60_000),
  _setFetch: (f) => { fetchImpl = f; },
};
