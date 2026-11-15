'use strict';
/**
 * E2E over HTTP against the test instance, without a browser: a user's paths through the real app.
 * Checks the page, all assets it loads and the API key flow. validate.test.js checks the JS syntax.
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const PORT = parseInt(process.env.PORT || '3070', 10);
const BASE = `http://127.0.0.1:${PORT}`;
const user = { 'x-user-email': 'nutzer@beispiel.de', 'x-user-name': 'Nora Nutzer', 'x-user-role': 'user' };
const admin = { 'x-user-email': 'chef@beispiel.de', 'x-user-role': 'admin' };
const get = (url, headers = {}) => fetch(BASE + url, { headers, redirect: 'manual' });
const stripBase = (src) => src.split('?')[0].slice('/finance'.length);

before(async () => {
  const r = await fetch(`${BASE}/health`);
  if (r.status !== 200) throw new Error(`finance läuft nicht auf ${BASE}`);
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
  for (const p of ['/transactions', '/transactions/5', '/investments', '/import', '/categories', '/loans', '/estate', '/amazon']) {
    const res = await get(p, user);
    assert.equal(res.status, 200, p);
    assert.match(await res.text(), /home-page\.js/);
  }
});

test('/api/me liefert Identität und Rolle', async () => {
  assert.deepEqual(await (await get('/api/me', user)).json(), { id: 'nutzer@beispiel.de', email: 'nutzer@beispiel.de', name: 'Nora Nutzer', role: 'user', finance: false });
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

const admin2 = { 'x-user-email': 'chef@beispiel.de', 'x-user-role': 'admin', 'content-type': 'application/json', origin: BASE };
const guest = { 'x-user-email': 'gast@beispiel.de', 'x-user-role': 'user', 'content-type': 'application/json', origin: BASE };

test('Kategorien: hinzufügen und bearbeiten nur mit Finanz-Zugriff', async () => {
  const post = (h, body) => fetch(`${BASE}/api/categories`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  assert.equal((await post(guest, { name: 'Gast', art: 'Ausgaben' })).status, 403);
  const name = `E2E Haustiere ${Date.now().toString(36)}`; // run-all.sh runs every suite twice against one database
  const res = await post(admin2, { name, art: 'Ausgaben', code: `E${Date.now().toString(36).slice(-6).toUpperCase()}`, budget_cents: 5000 });
  assert.equal(res.status, 201);
  const { category } = await res.json();
  assert.equal((await post(admin2, { name, art: 'Ausgaben', code: 'E2EX' })).status, 409);
  assert.equal((await fetch(`${BASE}/api/categories/${encodeURIComponent(category.code)}`, { method: 'PATCH', headers: admin2, body: JSON.stringify({ art: 'Einnahmen' }) })).status, 204);
  const list = await (await get('/api/categories', admin2)).json();
  assert.ok(list.arts.includes('Rücklagen'));
  assert.equal(list.categories.find((c) => c.code === category.code).art, 'Einnahmen');
});

test('MCP-Schlüssel (Scope finance): nur mit Finanz-Zugriff, nur lesend, beim Entzug gesperrt', async () => {
  const key = async (h, scopes) => fetch(`${BASE}/api/me/api-keys`, { method: 'POST', headers: h, body: JSON.stringify({ label: 'zottel', scopes }) });
  const helfer = { ...guest, 'x-user-email': `helfer-${Date.now().toString(36)}@beispiel.de` };
  assert.equal((await key(helfer, 'finance')).status, 403, 'ohne Zugang kein Finanz-Schlüssel');
  const adminKey = (await (await key(admin2, 'finance')).json()).key;
  const ext = (k, url) => fetch(`${BASE}/api/external/finance${url}`, { headers: { authorization: `Bearer ${k}` } });
  for (const url of ['/overview?year=2026', '/transactions?year=all&q=e&limit=5', '/investments', '/loans', '/estate']) assert.equal((await ext(adminKey, url)).status, 200, url);
  const tx = await (await ext(adminKey, '/transactions?year=all&limit=3')).json();
  assert.ok(tx.shown <= 3 && typeof tx.count === 'number');
  const readKey = (await (await key(admin2, 'read')).json()).key;
  assert.equal((await ext(readKey, '/overview')).status, 403, 'read allein reicht nicht');
  assert.equal((await fetch(`${BASE}/api/external/finance/overview`)).status, 401);
  // Zugang geben, Schlüssel anlegen, Zugang entziehen: der Schlüssel ist sofort gesperrt.
  assert.equal((await fetch(`${BASE}/api/access`, { method: 'POST', headers: admin2, body: JSON.stringify({ email: helfer['x-user-email'] }) })).status, 201);
  const helferKey = (await (await key(helfer, 'finance')).json()).key;
  assert.equal((await ext(helferKey, '/loans')).status, 200);
  assert.equal((await fetch(`${BASE}/api/access/${encodeURIComponent(helfer['x-user-email'])}`, { method: 'DELETE', headers: admin2 })).status, 204);
  assert.equal((await ext(helferKey, '/loans')).status, 401, 'nach dem Entzug gesperrt');
});

test('Finanzen: privat, Admin immer, andere erst nach Freigabe', async () => {
  assert.equal((await get('/api/overview', guest)).status, 403);
  assert.equal((await get('/api/overview', admin2)).status, 200);
  assert.equal((await (await get('/api/me', guest)).json()).finance, false);
  assert.equal((await fetch(`${BASE}/api/access`, { method: 'POST', headers: guest, body: JSON.stringify({ email: 'x@y.de' }) })).status, 403);
  assert.equal((await fetch(`${BASE}/api/access`, { method: 'POST', headers: admin2, body: JSON.stringify({ email: 'gast@beispiel.de' }) })).status, 201);
  assert.equal((await get('/api/overview', guest)).status, 200);
  assert.equal((await fetch(`${BASE}/api/access/gast%40beispiel.de`, { method: 'DELETE', headers: admin2 })).status, 204);
  assert.equal((await get('/api/overview', guest)).status, 403);
});

test('Finanzen: CSV-Import über die Seite, Dubletten werden erkannt, fremde Herkunft abgewiesen', async () => {
  const csv = 'Buchungstag;Wertstellung (Valuta);Vorgang;Buchungstext;Umsatz in EUR\n02.01.2024;02.01.2024;Lastschrift / Belastung;Auftraggeber: Testladen Buchungstext: Einkauf;-12,34\n';
  const send = (headers) => { const f = new FormData(); f.append('file', new Blob([csv], { type: 'text/csv' }), 'umsaetze.csv'); const { 'content-type': _ct, ...h } = headers; return fetch(`${BASE}/api/imports`, { method: 'POST', headers: h, body: f }); };
  const first = await (await send(admin2)).json();
  assert.equal(first.format, 'comdirect'); assert.equal(first.rows, 1);
  const again = await (await send(admin2)).json();
  assert.equal(again.added, 0); assert.equal(again.duplicates, 1);
  assert.equal((await send({ ...admin2, origin: 'https://fremd.familiebiskup.de' })).status, 403);
});
