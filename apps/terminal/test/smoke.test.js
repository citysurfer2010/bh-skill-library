'use strict';
/** Smoke: Jeder öffentliche Endpoint der laufenden Testinstanz antwortet wie erwartet. */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const PORT = parseInt(process.env.PORT || '3400', 10);
const get = (url, opts) => fetch(`http://127.0.0.1:${PORT}${url}`, opts);

before(async () => {
  await get('/health').catch(() => { throw new Error(`Terminal läuft nicht auf Port ${PORT}. Tests über npm test starten.`); });
});

test('GET /health → 200 JSON', async () => {
  const res = await get('/health');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
  assert.equal(data.skill, 'terminal');
});

test('GET /api/me → 401 ohne Anmeldung', async () => {
  assert.equal((await get('/api/me')).status, 401);
});

test('GET /bh-styles.css → 200 text/css mit Tokens und Knöpfen', async () => {
  const res = await get('/bh-styles.css');
  assert.equal(res.status, 200);
  assert.ok((res.headers.get('content-type') || '').startsWith('text/css'));
  const body = await res.text();
  assert.ok(body.includes('--bh-primary'), 'Tokens fehlen');
  assert.ok(body.includes('.bh-btn'), 'Knöpfe fehlen');
  assert.ok(body.includes('.bhs-navbar'), 'Rahmen fehlt');
});

test('GET /app.css → 200 text/css', async () => {
  const res = await get('/app.css');
  assert.equal(res.status, 200);
  assert.ok((res.headers.get('content-type') || '').startsWith('text/css'));
});

test('GET /api/build-id → 200 ohne Anmeldung', async () => {
  const res = await get('/api/build-id');
  assert.equal(res.status, 200);
  assert.match(String((await res.json()).buildId), /^[a-z0-9]+$/);
});

test('GET /build-version-check.js → 200 JS, gegen doppeltes Laden geschützt', async () => {
  const res = await get('/build-version-check.js');
  assert.equal(res.status, 200);
  assert.ok((res.headers.get('content-type') || '').includes('javascript'));
  const body = await res.text();
  assert.match(body, /api\/build-id/);
  assert.match(body, /__buildCheckInstalled/);
});

test('Bearer-API → 401 ohne und mit ungültigem Token', async () => {
  assert.equal((await get('/api/external/submit', { method: 'POST' })).status, 401);
  assert.equal((await get('/api/external/submit', { method: 'POST', headers: { Authorization: 'Bearer bhter_nonexistent' } })).status, 401);
  assert.equal((await get('/api/external/records')).status, 401);
});
