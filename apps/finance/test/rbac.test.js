'use strict';
/**
 * RBAC: who may do what, and login stays closed if something is missing.
 * Add an entry here for every new protected route (table PROTECTED).
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, resetAuthEnv } = require('./helpers');

// [method, path, required role]
const PROTECTED = [
  ['GET', '/', 'user'],
  ['GET', '/transactions', 'user'],
  ['GET', '/api/overview', 'admin'],
  ['GET', '/api/transactions', 'admin'],
  ['GET', '/api/bank/status', 'admin'],
  ['GET', '/api/accounts', 'admin'],
  ['GET', '/api/amazon/status', 'admin'],
  ['GET', '/accounts', 'user'],
  ['GET', '/2026', 'user'],
  ['GET', '/2026/transactions', 'user'],
  ['GET', '/all/transactions', 'user'],
  ['GET', '/transactions/1', 'user'],
  ['GET', '/api/me', 'user'],
  ['GET', '/api/me/api-keys', 'user'],
  ['GET', '/admin', 'admin'],
];

let t;
before(async () => { t = await startApp(); });
after(() => t.close());
beforeEach(() => resetAuthEnv({ TRUST_PROXY_AUTH: '1' }));

for (const [method, url, role] of PROTECTED) {
  test(`${method} ${url}: ohne Anmeldung 401`, async () => {
    assert.equal((await t.call(url, { method })).status, 401);
  });

  if (role === 'admin') {
    test(`${method} ${url}: als user 403, als admin 200`, async () => {
      assert.equal((await t.call(url, { method, as: 'u@beispiel.de', role: 'user' })).status, 403);
      assert.equal((await t.call(url, { method, as: 'a@beispiel.de', role: 'admin' })).status, 200);
    });
  } else {
    test(`${method} ${url}: als user 200`, async () => {
      assert.equal((await t.call(url, { method, as: 'u@beispiel.de', role: 'user' })).status, 200);
    });
  }
}

test('ohne TRUST_PROXY_AUTH=1 werden die Kopfzeilen ignoriert', async () => {
  for (const flag of [undefined, '0', 'true', '']) {
    resetAuthEnv(flag === undefined ? {} : { TRUST_PROXY_AUTH: flag });
    assert.equal((await t.call('/api/me', { as: 'evil@beispiel.de', role: 'admin' })).status, 401, `TRUST_PROXY_AUTH=${flag}`);
  }
});

test('DEV_USER_EMAIL gilt nur ohne TRUST_PROXY_AUTH=1', async () => {
  resetAuthEnv({ DEV_USER_EMAIL: 'dev@beispiel.de', DEV_USER_ROLE: 'admin' });
  const me = await (await t.call('/api/me')).json();
  assert.equal(me.email, 'dev@beispiel.de');
  assert.equal(me.role, 'admin');
  assert.equal((await t.call('/admin')).status, 200);

  resetAuthEnv({ TRUST_PROXY_AUTH: '1', DEV_USER_EMAIL: 'dev@beispiel.de', DEV_USER_ROLE: 'admin' });
  assert.equal((await t.call('/api/me')).status, 401, 'DEV_USER darf hinter dem Proxy nicht greifen');
});

test('Kopfzeilen: Name und Rolle werden übernommen, E-Mail normalisiert', async () => {
  const me = await (await t.call('/api/me', { as: ' Eva@Beispiel.de ', role: 'admin', name: 'Eva Muster' })).json();
  assert.deepEqual(me, { id: 'eva@beispiel.de', email: 'eva@beispiel.de', name: 'Eva Muster', role: 'admin', finance: true });
});

test('unbekannte Rolle ist user, auch bei abweichender Schreibweise', async () => {
  for (const role of ['superadmin', 'Admin', 'ADMIN', 'root']) {
    const res = await t.call('/api/me', { as: 'u@beispiel.de', role });
    assert.equal((await res.json()).role, 'user', role);
    assert.equal((await t.call('/admin', { as: 'u@beispiel.de', role })).status, 403, role);
  }
  assert.equal((await (await t.call('/api/me', { as: 'u@beispiel.de' })).json()).role, 'user');
});

test('ungültige E-Mail in der Kopfzeile bleibt draußen', async () => {
  for (const as of ['keine-mail', '@', 'a@', '@b']) {
    assert.equal((await t.call('/api/me', { as, role: 'admin' })).status, 401, as);
  }
});

test('API-Keys sind pro Benutzer getrennt', async () => {
  const created = await (await t.call('/api/me/api-keys', { method: 'POST', as: 'a@beispiel.de', body: { label: 'eigener' } })).json();
  const other = await (await t.call('/api/me/api-keys', { as: 'b@beispiel.de' })).json();
  assert.ok(!other.keys.some((k) => k.id === created.id), 'fremder Key sichtbar');
  assert.equal((await t.call(`/api/me/api-keys/${created.id}`, { method: 'DELETE', as: 'b@beispiel.de' })).status, 404);
});

test('Marken-Dateien laden ohne Anmeldung, die Oberfläche nicht', async () => {
  assert.equal((await t.call('/favicon.svg')).status, 200);
  assert.equal((await t.call('/manifest.webmanifest')).status, 200);
  assert.equal((await t.call('/branding/nav-icon.svg')).status, 200);
  assert.equal((await t.call('/components/pages/home-page.js')).status, 401);
});

test('GET /api/transactions/:id: eigene Adresse je Buchung, 404 für unbekannte, 403 ohne Finanzzugang', async () => {
  const { getDb } = require('../lib/db');
  const id = getDb().prepare("INSERT INTO transactions (account, booked_on, amount_cents, hash, created_at) VALUES ('t', '2023-05-04', -100, ?, '2026-11-15')").run(`rbac-deeplink-${process.pid}-${Date.now()}`).lastInsertRowid;
  const ok = await t.call(`/api/transactions/${id}`, { as: 'a@beispiel.de', role: 'admin' });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).transaction.booked_on, '2023-05-04');
  assert.equal((await t.call('/api/transactions/999999', { as: 'a@beispiel.de', role: 'admin' })).status, 404);
  assert.equal((await t.call(`/api/transactions/${id}`, { as: 'u@beispiel.de', role: 'user' })).status, 403);
});

test('GET /api/transactions?year=all&account=…: alle Jahre eines Kontos', async () => {
  const { getDb } = require('../lib/db');
  const ins = getDb().prepare('INSERT INTO transactions (account, booked_on, amount_cents, hash, created_at) VALUES (?, ?, ?, ?, ?)');
  const tag = `${process.pid}-${Date.now()}`;
  ins.run(`alle-jahre-${tag}`, '2021-02-03', -1, `aj1-${tag}`, '2026-11-15'); ins.run(`alle-jahre-${tag}`, '2025-02-03', -2, `aj2-${tag}`, '2026-11-15');
  const r = await t.call(`/api/transactions?year=all&account=${encodeURIComponent(`alle-jahre-${tag}`)}`, { as: 'a@beispiel.de', role: 'admin' });
  assert.equal(r.status, 200); assert.equal((await r.json()).transactions.length, 2);
});
