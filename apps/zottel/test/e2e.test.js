'use strict';
/**
 * E2E over HTTP against the test instance, without a browser: a user's paths through the real app.
 * Checks the page, all assets it loads and the API key flow. validate.test.js checks the JS syntax.
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const PORT = parseInt(process.env.PORT || '3060', 10);
const BASE = `http://127.0.0.1:${PORT}`;
const user = { 'x-user-email': 'nutzer@beispiel.de', 'x-user-name': 'Nora Nutzer', 'x-user-role': 'user' };
const admin = { 'x-user-email': 'chef@beispiel.de', 'x-user-role': 'admin' };
const get = (url, headers = {}) => fetch(BASE + url, { headers, redirect: 'manual' });
const stripBase = (src) => src.split('?')[0].slice('/zottel'.length);

before(async () => {
  const r = await fetch(`${BASE}/health`);
  if (r.status !== 200) throw new Error(`zottel läuft nicht auf ${BASE}`);
});

test('ohne Anmeldung: eigene Fehlerseite statt App', async () => {
  const res = await get('/');
  assert.equal(res.status, 401);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const body = await res.text();
  assert.match(body, /Nicht angemeldet/);
  assert.doesNotMatch(body, /page-host/);
});

test('angemeldet: Seite kommt, jedes verlinkte Asset lädt', async () => {
  const res = await get('/', user);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store, must-revalidate');
  const html = await res.text();
  assert.match(html, /id="page-host"/);
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(urls.length >= 7, `zu wenige Assets: ${urls.length}`);
  for (const u of urls) assert.equal((await get(stripBase(u), user)).status, 200, u);
});

test('Tiefe Pfade liefern dieselbe Seite', async () => {
  for (const p of ['/c/abc123', '/memory']) {
    const res = await get(p, user);
    assert.equal(res.status, 200, p);
    assert.match(await res.text(), /home-page\.js/);
  }
});

test('/api/me liefert Identität und Rolle', async () => {
  assert.deepEqual(await (await get('/api/me', user)).json(), { id: 'nutzer@beispiel.de', email: 'nutzer@beispiel.de', name: 'Nora Nutzer', role: 'user' });
});

test('Admin-Bereich: user 403 als Seite, admin 200', async () => {
  const denied = await get('/admin', user);
  assert.equal(denied.status, 403);
  assert.match(await denied.text(), /Keine Berechtigung/);
  const ok = await get('/admin', admin);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /admin-page\.js/);
});

test('API-Key-Strecke: anlegen, benutzen, zurückziehen', async () => {
  const headers = { ...user, 'content-type': 'application/json' };
  const created = await fetch(`${BASE}/api/me/api-keys`, { method: 'POST', headers, body: JSON.stringify({ label: 'e2e', scopes: 'read' }) });
  assert.equal(created.status, 201);
  const { id, key } = await created.json();
  const bearer = { Authorization: `Bearer ${key}` };
  assert.equal((await fetch(`${BASE}/api/external/records`, { headers: bearer })).status, 200);
  assert.equal((await fetch(`${BASE}/api/external/submit`, { method: 'POST', headers: bearer })).status, 403, 'Scope submit fehlt');
  assert.equal((await fetch(`${BASE}/api/me/api-keys/${id}`, { method: 'DELETE', headers: user })).status, 200);
  assert.equal((await fetch(`${BASE}/api/external/records`, { headers: bearer })).status, 401, 'zurückgezogener Key gilt noch');
});

test('unbekannte Adresse: 404-Seite, unter /api/ JSON', async () => {
  const page = await get('/gibt-es-nicht', user);
  assert.equal(page.status, 404);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const api = await get('/api/gibt-es-nicht', user);
  assert.equal(api.status, 404);
  assert.equal((await api.json()).code, 404);
});

const post = (url, headers, body, method = 'POST') => fetch(BASE + url, { method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body || {}) });

test('Gespräche gehören nur ihrem Besitzer', async () => {
  const other = { 'x-user-email': 'ben@beispiel.de', 'x-user-role': 'user' };
  const chat = await (await post('/api/chats', user)).json();
  assert.equal((await get(`/api/chats/${chat.id}`, user)).status, 200);
  assert.equal((await get(`/api/chats/${chat.id}`, other)).status, 404);
  assert.equal((await post(`/api/chats/${chat.id}/messages`, other, { text: 'x' })).status, 404);
  assert.equal((await post('/api/cards/gibtsnicht', user, { decision: 'once' })).status, 404);
});

test('Schreiben von einer fremden Herkunft wird abgewiesen', async () => {
  assert.equal((await post('/api/chats', { ...user, origin: 'https://fremd.familiebiskup.de' })).status, 403);
  assert.equal((await post('/api/chats', { ...user, origin: BASE })).status, 201);
});

test('Einrichtung: einmal je User, Neustart auf Wunsch', async () => {
  const kid = { 'x-user-email': `kind-${Date.now()}@beispiel.de`, 'x-user-role': 'user' };
  assert.equal((await (await get('/api/setup', kid)).json()).done, false);
  const first = await (await post('/api/setup', kid)).json();
  assert.ok(first.chatId);
  assert.equal((await (await post('/api/setup', kid)).json()).chatId, first.chatId);
  const again = await (await post('/api/setup', kid, { restart: true })).json();
  assert.notEqual(again.chatId, first.chatId);
  assert.equal((await (await get('/api/setup', kid)).json()).chatId, again.chatId);
});
