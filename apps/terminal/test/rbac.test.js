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
  ['GET', '/guide', 'user'],
  ['GET', '/api/status', 'user'],
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
  assert.deepEqual(me, { id: 'eva@beispiel.de', email: 'eva@beispiel.de', name: 'Eva Muster', role: 'admin' });
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
