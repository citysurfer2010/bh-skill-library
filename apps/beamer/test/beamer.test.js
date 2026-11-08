'use strict';
/** Bedienung: nur Katalog-Inhalte erreichen den Beamer, Fehler kommen beim Benutzer an, jeder Schreibweg verlangt eine Anmeldung. */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers');
const gateway = require('../lib/gateway');

let t; let calls; let fail;
before(async () => { t = await startApp(); });
after(() => { gateway.setCaller(null); return t.close(); });
beforeEach(() => {
  calls = []; fail = null;
  gateway.setCaller(async (name, args) => { calls.push([name, args]); if (fail) throw new Error(fail); return name === 'beamer_status' ? '{"zustand":"on"}' : 'ok'; });
});
const post = (url, body, as = 'u@beispiel.de') => t.call(`/api${url}`, { method: 'POST', as, body: body || {} });

const WRITES = ['/mood', '/radio', '/radio/stop', '/youtube', '/text', '/url', '/app', '/key', '/power', '/share/start', '/share/answer', '/share/stop'];
for (const w of WRITES) {
  test(`POST ${w}: ohne Anmeldung 401, ohne JSON 415`, async () => {
    assert.equal((await t.call(`/api${w}`, { method: 'POST', body: {} })).status, 401);
    assert.equal((await t.call(`/api${w}`, { method: 'POST', as: 'u@beispiel.de', headers: { 'content-type': 'text/plain' } })).status, 415);
    assert.equal(calls.length, 0);
  });
}

test('Stimmung spielt das hinterlegte Video, fremde Kennung nicht', async () => {
  assert.equal((await post('/mood', { id: 'kamin' })).status, 200);
  assert.deepEqual(calls[0], ['beamer_play_youtube', { video: '6VB4bgiB0yA' }]);
  calls.length = 0;
  assert.equal((await post('/mood', { id: 'evil' })).status, 400);
  assert.equal(calls.length, 0);
});

test('Radio: Adresse kommt aus dem Katalog, eigene Adresse wird ignoriert', async () => {
  await post('/radio', { id: 'ndr2', url: 'https://boese.example/x.mp3' });
  assert.equal(calls[0][0], 'beamer_play_radio'); assert.match(calls[0][1].url, /ndr\.de/); assert.equal(calls[0][1].title, 'NDR 2');
  assert.equal((await post('/radio', { id: 'nix' })).status, 400);
});

test('Video nach Radio beendet erst das Radio und meldet, was läuft', async () => {
  await post('/radio', { id: 'ndr2' });
  calls.length = 0;
  const r = await (await post('/mood', { id: 'regen' })).json();
  assert.deepEqual(calls.map((c) => c[0]), ['beamer_stop_radio', 'beamer_play_youtube']);
  assert.equal(r.now.label, 'Regen am Fenster');
  const s = await (await t.call('/api/status', { as: 'u@beispiel.de' })).json();
  assert.equal(s.zustand, 'on'); assert.equal(s.now.id, 'regen');
});

test('Status: Ausfall des Gateways ist kein Fehler, sondern ein Zustand', async () => {
  fail = 'weg';
  const s = await t.call('/api/status', { as: 'u@beispiel.de' });
  assert.equal(s.status, 200); assert.equal((await s.json()).zustand, 'nicht erreichbar');
});

test('Eingaben: Text und https werden geprüft', async () => {
  assert.equal((await post('/text', { title: '  ' })).status, 400);
  assert.equal((await post('/url', { url: 'http://a.de' })).status, 400);
  assert.equal((await post('/url', { url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await post('/youtube', {})).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await post('/text', { title: 'Hallo' })).status, 200);
  assert.deepEqual(calls[0], ['beamer_show_text', { title: 'Hallo', text: '' }]);
});

test('Tasten und Apps nur aus der Liste, Ausschalten nie als Taste', async () => {
  assert.equal((await post('/key', { key: 'KEY_POWER' })).status, 400);
  assert.equal((await post('/key', { key: 'KEY_FACTORY' })).status, 400);
  assert.equal((await post('/app', { app: 'Tetris' })).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await post('/key', { key: 'KEY_VOLUP' })).status, 200);
  assert.deepEqual(calls[0], ['beamer_press', { key: 'KEY_VOLUP' }]);
});

test('Freigabe: nur gültiges Angebot, Sitzung kommt zurück, Antwort wird durchgereicht', async () => {
  assert.equal((await post('/share/start', { offer: 'quatsch' })).status, 400);
  assert.equal((await post('/share/start', { offer: `v=0${'x'.repeat(24001)}` })).status, 400);
  assert.equal((await post('/share/answer', { session: '../etc' })).status, 400);
  assert.equal(calls.length, 0);
  gateway.setCaller(async (name) => { calls.push(name); return name === 'beamer_share_start' ? 'aabbccddeeff001122' : 'v=0 antwort'; });
  const start = await (await post('/share/start', { offer: 'v=0 a' })).json();
  assert.equal(start.session, 'aabbccddeeff001122'); assert.equal(start.now.kind, 'share');
  assert.equal((await (await post('/share/answer', { session: start.session })).json()).answer, 'v=0 antwort');
  assert.equal((await (await post('/share/stop')).json()).now, null);
  assert.deepEqual(calls, ['beamer_share_start', 'beamer_share_answer', 'beamer_stop_radio']);
});

test('Ein/Aus: nur on und off, Aus räumt die Anzeige, Fehler kommt an', async () => {
  assert.equal((await post('/power', { state: 'reboot' })).status, 400);
  await post('/mood', { id: 'kamin' });
  const off = await (await post('/power', { state: 'off' })).json();
  assert.equal(off.now, null);
  fail = 'Der Beamer ist trotz Ausschalt-Befehl noch an';
  const r = await post('/power', { state: 'off' });
  assert.equal(r.status, 502); assert.match((await r.json()).error, /noch an/);
});
