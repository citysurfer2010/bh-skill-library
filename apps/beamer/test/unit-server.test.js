'use strict';
/** Unit: the app runs IN this process so that c8 measures server.js, routes and lib. HTTP suites run in a separate process. */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startApp, resetAuthEnv, tmpDir } = require('./helpers');
const llm = require('../lib/llm');
const errorPage = require('../lib/error-page');

let t;
before(async () => { t = await startApp(); });
after(() => t.close());
beforeEach(() => resetAuthEnv({ TRUST_PROXY_AUTH: '1' }));

const user = { as: 'u@beispiel.de', role: 'user' };

test('GET /health → 200', async () => {
  const r = await t.call('/health');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).skill, 'beamer');
});

test('Öffentliche Bündel', async () => {
  for (const u of ['/api/build-id', '/bh-styles.css', '/app.css', '/app.js', '/build-version-check.js']) {
    assert.equal((await t.call(u)).status, 200, u);
  }
});

test('GET / setzt Cache-Buster an lokale Assets', async () => {
  assert.match(await (await t.call('/', user)).text(), /app\.js\?v=[a-z0-9]+/);
});

test('API-Keys: anlegen, auflisten, zurückziehen', async () => {
  const create = await t.call('/api/me/api-keys', { method: 'POST', ...user, body: { label: 'unit' } });
  assert.equal(create.status, 201);
  const { key, id } = await create.json();
  assert.ok(key.startsWith('bhbea_'), 'Präfix');
  const list = await (await t.call('/api/me/api-keys', user)).json();
  assert.ok(list.keys.some((k) => k.id === id));
  assert.ok(!JSON.stringify(list).includes(key), 'Klartext darf nie wieder auftauchen');
  assert.equal((await t.call(`/api/me/api-keys/${id}`, { method: 'DELETE', ...user })).status, 200);
  assert.equal((await t.call(`/api/me/api-keys/${id}`, { method: 'DELETE', ...user })).status, 404);
});

test('API-Keys: Eingaben werden geprüft', async () => {
  assert.equal((await t.call('/api/me/api-keys', { method: 'POST', ...user, body: { label: ' ' } })).status, 400);
  assert.equal((await t.call('/api/me/api-keys', { method: 'POST', ...user, body: { label: 'x', scopes: 'alles' } })).status, 400);
});

test('Kaputtes JSON → 400, kein Stacktrace', async () => {
  const bad = await fetch(`${t.base}/api/me/api-keys`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user-email': 'u@beispiel.de' }, body: '{kaputt' });
  assert.equal(bad.status, 400);
  assert.doesNotMatch(await bad.text(), /node_modules|at .*\.js/);
});

async function newKey(scopes) {
  return (await (await t.call('/api/me/api-keys', { method: 'POST', ...user, body: { label: 'ext', scopes } })).json()).key;
}

test('Bearer-API: Scopes werden erzwungen', async () => {
  const read = { Authorization: `Bearer ${await newKey('read')}` };
  const submit = { Authorization: `Bearer ${await newKey('submit')}` };
  assert.equal((await t.call('/api/external/records', { headers: read })).status, 200);
  assert.equal((await t.call('/api/external/records', { headers: submit })).status, 403);
  assert.equal((await t.call('/api/external/submit', { method: 'POST', headers: submit })).status, 201);
  assert.equal((await t.call('/api/external/submit', { method: 'POST', headers: read })).status, 403);
});

test('Upload: erlaubter Typ wird gespeichert, ohne eigenen Dateinamen; fremder Typ abgelehnt', async () => {
  const headers = { Authorization: `Bearer ${await newKey('submit')}` };
  const form = (type, name) => { const f = new FormData(); f.append('file', new Blob(['inhalt'], { type }), name); return f; };
  const ok = await fetch(`${t.base}/api/external/records/1/upload`, { method: 'POST', headers, body: form('application/pdf', '../../boese.pdf') });
  assert.equal(ok.status, 201);
  const { attachment } = await ok.json();
  assert.match(attachment.storedAs, /^[0-9a-f]{20}\.pdf$/);
  assert.ok(fs.existsSync(path.join(require('../lib/config').UPLOADS_DIR, attachment.storedAs)));
  const no = await fetch(`${t.base}/api/external/records/1/upload`, { method: 'POST', headers, body: form('application/x-msdownload', 'a.exe') });
  assert.equal(no.status, 400);
});

test('Fehlerbehandlung: 500 mit Vorgangsnummer, ohne Interna', () => {
  const sent = {};
  const res = { status(s) { sent.status = s; return this; }, json(b) { sent.body = b; return this; }, set() { return this; }, type() { return this; }, send(b) { sent.body = b; return this; } };
  const original = console.error;
  console.error = () => {};
  try { errorPage.errorHandler(new Error('geheimes Detail'), { originalUrl: '/api/x' }, res, () => {}); } finally { console.error = original; }
  assert.equal(sent.status, 500);
  assert.match(sent.body.incident, /^[0-9a-f]{8}$/);
  assert.doesNotMatch(JSON.stringify(sent.body), /geheimes Detail/);
});

test('Fehlerseite escaped die Meldung', () => {
  let body = '';
  const res = { status() { return this; }, set() { return this; }, type() { return this; }, send(b) { body = b; return this; } };
  errorPage.sendError({ originalUrl: '/x' }, res, { status: 403, message: '<script>x</script>' });
  assert.doesNotMatch(body, /<script>x<\/script>/);
  assert.match(body, /&lt;script&gt;/);
});

test('LLM nur über das Gateway mit dem Token aus der Datei', async () => {
  const dir = tmpDir();
  const tokenFile = path.join(dir, 'token');
  fs.writeFileSync(tokenFile, 'test-token\n');
  let seen = null;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ choices: [{ message: { content: 'hallo' } }] }) }; };
  assert.equal(await llm.chat({ messages: [{ role: 'user', content: 'hi' }] }, { tokenFile, fetchImpl }), 'hallo');
  assert.equal(seen.url, 'http://llm-gateway:18790/v1/chat/completions');
  assert.equal(seen.init.headers.Authorization, 'Bearer test-token');
  assert.equal(JSON.parse(seen.init.body).model, 'tier:balanced');
});

test('LLM: fehlendes Token und Gateway-Fehler sind klare Fehler ohne Token im Text', async () => {
  const dir = tmpDir();
  await assert.rejects(llm.chat({ messages: [{ role: 'user', content: 'x' }] }, { tokenFile: path.join(dir, 'fehlt') }), /LLM-Token nicht lesbar/);
  const tokenFile = path.join(dir, 'token');
  fs.writeFileSync(tokenFile, 'geheim');
  await assert.rejects(
    llm.chat({ messages: [{ role: 'user', content: 'x' }] }, { tokenFile, fetchImpl: async () => ({ ok: false, status: 502 }) }),
    (e) => /502/.test(e.message) && !e.message.includes('geheim'),
  );
  await assert.rejects(llm.chat({ messages: [] }), /messages required/);
});

test('Fotos: Anfragen werden gedrosselt, Start geht immer durch', async () => {
  const gateway = require('../lib/gateway');
  const stream = require('../lib/photo-stream');
  const calls = [];
  gateway.setCaller(async (name, args) => { calls.push([name, args.start]); return '{}'; });
  try {
    stream.reset();
    stream.handle('../boese'); stream.handle('all');
    stream.handle('next');
    stream.handle('a0123456789ab');
    assert.deepEqual(calls, [['photos_push_next', 'all'], ['photos_push_next', 'a0123456789ab']]);
  } finally { gateway.setCaller(null); stream.reset(); }
});
