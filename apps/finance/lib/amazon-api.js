'use strict';
/** Client of the bh-amazon worker (skills/bh-amazon). Without its key the Amazon feature is off. */
const fs = require('fs');
const http = require('http');
const path = require('path');

const BASE = process.env.AMAZON_URL || 'http://bh-amazon:3800';
const KEY_FILE = process.env.AMAZON_TOKEN_FILE || path.join(process.env.BANK_SECRETS_DIR || '/etc/devbox/llm', 'amazon-token');
let fetchImpl = null; // set only by tests

const token = () => { try { return fs.readFileSync(KEY_FILE, 'utf8').trim(); } catch { return ''; } };
const configured = () => !!token();

/**
 * node:http instead of fetch: fetch gives up after five minutes without response headers, and the first full Amazon
 * fetch takes longer. Here only our own deadline counts (timeoutMs).
 */
function call(method, url, body, timeoutMs = 120_000) {
  const t = token();
  if (!t) return Promise.reject(Object.assign(new Error('Amazon-Abruf ist nicht eingerichtet'), { status: 503 }));
  if (fetchImpl) return viaFetch(method, url, body, t, timeoutMs);
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(new URL(url, BASE), { method, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let raw = ''; res.setEncoding('utf8'); res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        clearTimeout(timer); let out = {}; try { out = raw ? JSON.parse(raw) : {}; } catch { /* not JSON */ }
        if (res.statusCode >= 400) reject(Object.assign(new Error(out.error || `Amazon-Dienst antwortet mit ${res.statusCode}`), { status: res.statusCode, code: out.code })); else resolve(out);
      });
    });
    const timer = setTimeout(() => req.destroy(Object.assign(new Error('Amazon-Dienst antwortet nicht (Zeit abgelaufen)'), { status: 504 })), timeoutMs);
    req.on('error', (e) => { clearTimeout(timer); reject(e.status ? e : Object.assign(new Error('Amazon-Dienst nicht erreichbar'), { status: 502, cause: e })); });
    if (data) req.write(data);
    req.end();
  });
}

/** Tests replace the transport with a fake fetch. */
async function viaFetch(method, url, body, t, timeoutMs) {
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
  _call: (...a) => call(...a),
};
