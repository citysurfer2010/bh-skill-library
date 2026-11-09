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

const WRITES = ['/mood', '/radio', '/radio/stop', '/youtube', '/text', '/url', '/app', '/key', '/power', '/share/start', '/share/answer', '/share/stop', '/stop'];
for (const w of WRITES) {
  test(`POST ${w}: ohne Anmeldung 401, ohne JSON 415`, async () => {
    assert.equal((await t.call(`/api${w}`, { method: 'POST', body: {} })).status, 401);
    assert.equal((await t.call(`/api${w}`, { method: 'POST', as: 'u@beispiel.de', headers: { 'content-type': 'text/plain' } })).status, 415);
    assert.equal(calls.length, 0);
  });
}

test('Stimmung spielt das hinterlegte Video, fremde Kennung nicht', async () => {
  assert.equal((await post('/mood', { id: 'kamin' })).status, 200);
  assert.equal(calls[0][0], 'beamer_play_ambient'); assert.equal(calls[0][1].video, '6VB4bgiB0yA');
  calls.length = 0;
  assert.equal((await post('/mood', { id: 'evil' })).status, 400);
  assert.equal(calls.length, 0);
});

test('Radio: Adresse kommt aus dem Katalog, eigene Adresse wird ignoriert', async () => {
  await post('/stop'); calls.length = 0; // ohne laufende Stimmung, sonst käme das Radio dazu
  await post('/radio', { id: 'ndr2', url: 'https://boese.example/x.mp3' });
  assert.equal(calls[0][0], 'beamer_play_radio'); assert.match(calls[0][1].url, /ndr\.de/); assert.equal(calls[0][1].title, 'NDR 2');
  assert.equal((await post('/radio', { id: 'nix' })).status, 400);
});

test('Stimmung und Radio laufen zusammen, Zurück lässt das Radio weiterlaufen', async () => {
  await post('/radio', { id: 'ndr2' });
  calls.length = 0;
  const r = await (await post('/mood', { id: 'regen' })).json();
  assert.equal(calls[0][0], 'beamer_play_ambient'); assert.match(calls[0][1].radio_url, /ndr/);
  assert.equal(r.now.id, 'regen'); assert.equal(r.now.radio.id, 'ndr2');
  assert.match(r.now.label, /Regen am Fenster \+ NDR 2/);
  const s = await (await t.call('/api/status', { as: 'u@beispiel.de' })).json();
  assert.equal(s.zustand, 'on'); assert.equal(s.now.id, 'regen');
  calls.length = 0;
  const near = await (await post('/radio', { id: 'fritz' })).json();
  assert.equal(near.now.radio.id, 'fritz'); assert.equal(calls[0][1].station, 'Fritz');
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
  await post('/radio/stop'); calls.length = 0; // Die App merkt sich, was läuft; hier ohne vorherigen Inhalt
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

test('Nach der Freigabe läuft wieder der vorherige Inhalt', async () => {
  gateway.setCaller(async (name, args) => { calls.push([name, args]); return name === 'beamer_share_start' ? 'aabbccddeeff001122' : 'ok'; });
  await post('/radio', { id: 'ndr2' });
  await post('/share/start', { offer: 'v=0 a' });
  calls.length = 0;
  const r = await (await post('/share/stop')).json();
  assert.equal(r.now.id, 'ndr2'); assert.equal(calls[0][0], 'beamer_play_radio'); assert.match(calls[0][1].url, /ndr/);
  await post('/radio/stop');
  await post('/share/start', { offer: 'v=0 a' }); calls.length = 0;
  assert.equal((await (await post('/share/stop')).json()).now, null);
  assert.deepEqual(calls.map((c) => c[0]), ['beamer_stop_radio']);
});

test('Stoppen: Radio endet in BH Screen, Video über die Startseite', async () => {
  await post('/radio', { id: 'ndr2' }); calls.length = 0;
  assert.equal((await (await post('/stop')).json()).now, null);
  assert.deepEqual(calls, [['beamer_home', {}]]);
  await post('/mood', { id: 'kamin' }); calls.length = 0;
  await post('/stop');
  assert.deepEqual(calls, [['beamer_home', {}]]);
});

test('Home beendet die Anzeige, laufende App wird gemerkt', async () => {
  assert.equal((await (await post('/app', { app: 'Netflix' })).json()).now.id, 'Netflix');
  assert.equal((await (await post('/key', { key: 'KEY_HOME' })).json()).now, null);
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

test('Zurück am Beamer: nur Stimmung geht zum Startbild, mit Radio läuft das Radio weiter', async () => {
  const { buildRouter } = require('../routes/beamer');
  const { commands } = buildRouter();
  assert.equal(await commands.back(), null);
  await commands.mood('kamin');
  calls.length = 0; await commands.back();
  assert.deepEqual(calls.map((c) => c[0]), ['beamer_home']);
  await commands.radio('ndr2'); await commands.mood('kamin');
  calls.length = 0; await commands.back();
  assert.deepEqual(calls.map((c) => c[0]), ['beamer_play_radio']);
});

test('Menü: Auswahl am Beamer wird ausgeführt, unbekanntes ignoriert, Menü wird gesetzt', async () => {
  const bridge = require('../lib/menu-bridge');
  const done = [];
  const commands = { radio: async (id) => done.push(['radio', id]), mood: async (id) => done.push(['mood', id]) };
  let pending = JSON.stringify([{ kind: 'radio', id: 'ndr2' }, { kind: 'x', id: 'y' }, { kind: 'mood', id: 'kamin' }]);
  gateway.setCaller(async (name, args) => { calls.push([name, args]); if (name === 'beamer_menu_requests') { const p = pending; pending = '[]'; return p; } return 'ok'; });
  await bridge.tick(commands);
  assert.deepEqual(done, [['radio', 'ndr2'], ['mood', 'kamin']]);
  await bridge.pushMenu();
  const set = calls.find((c) => c[0] === 'beamer_menu_set');
  assert.match(set[1].menu.radio[0].url, /^https:/); assert.ok(set[1].menu.mood[0].thumb);
});

test('Stundenplan: erster Abruf nach Eintragung des Vertretungsplans, wandert ins Menü', async () => {
  const bridge = require('../lib/menu-bridge');
  assert.deepEqual(bridge.SCHEDULE_AT.slice(0, 3), ['06:30', '06:45', '07:00']);
  gateway.setCaller(async (name, args) => { calls.push([name, args]); return name === 'webuntis_days' ? JSON.stringify({ label: 'Heute', kids: [{ name: 'Anna', lessons: [] }] }) : 'ok'; });
  await bridge.refreshSchedule();
  assert.equal(calls.find((c) => c[0] === 'beamer_menu_set')[1].menu.schedule.kids[0].name, 'Anna');
});

test('Stundenplan: beim Öffnen frisch, aber höchstens alle 2 Minuten', async () => {
  const bridge = require('../lib/menu-bridge');
  let fetched = 0;
  gateway.setCaller(async (name) => { if (name === 'webuntis_days') { fetched++; return JSON.stringify({ label: 'Heute', kids: [] }); } return 'ok'; });
  const first = await bridge.refreshIfStale(true); assert.equal(first.label, 'Heute'); assert.equal(fetched, 1);
  await bridge.refreshIfStale(); assert.equal(fetched, 1);
  gateway.setCaller(async () => { fetched++; throw new Error('gestört'); });
  await assert.rejects(bridge.refreshIfStale(true)); fetched = 1;
  await bridge.refreshIfStale(); assert.equal(fetched, 1, 'nach Fehler keine sofortige neue Anmeldung');
  gateway.setCaller(async (name) => { if (name === 'webuntis_days') { fetched++; return JSON.stringify({ label: 'Heute', kids: [] }); } return 'ok'; });
  await bridge.refreshIfStale(true); assert.equal(fetched, 2);
  const r = await t.call('/api/schedule', { as: 'u@beispiel.de' });
  assert.equal(r.status, 200); assert.equal((await r.json()).label, 'Heute');
  assert.equal((await t.call('/api/schedule')).status, 401);
});

test('Störungen: nur bei Änderung ans Menü', async () => {
  const bridge = require('../lib/menu-bridge');
  let pushes = 0; let list = [{ label: 'Stadtbahn', text: 'S5 fällt aus' }];
  gateway.setCaller(async (name) => { if (name === 'bvg_alerts') return JSON.stringify(list); if (name === 'beamer_menu_set') pushes++; return 'ok'; });
  await bridge.refreshAlerts(); await bridge.refreshAlerts();
  assert.equal(pushes, 1);
  list = []; await bridge.refreshAlerts(); assert.equal(pushes, 2);
});

test('Abfahrten: Tafel kommt über den Skill und nur bei Änderung', async () => {
  const bridge = require('../lib/menu-bridge');
  let pushes = 0; const b = { stop: 'A', morning: false, departures: [] };
  gateway.setCaller(async (name, args) => { if (name === 'bvg_board') return JSON.stringify(b); if (name === 'beamer_menu_set') { pushes++; assert.equal(args.menu.board.stop, 'A'); } return 'ok'; });
  await bridge.refreshBoard(); await bridge.refreshBoard();
  assert.equal(pushes, 1);
});

test('Lagerfeuer: Schnee-Video nur im Winter', () => {
  const { MOODS, videoOf } = require('../lib/catalog');
  const fire = MOODS.find((m) => m.id === 'lagerfeuer');
  assert.equal(videoOf(fire, new Date('2026-01-15T20:00:00Z')), fire.winterVideo);
  assert.equal(videoOf(fire, new Date('2026-07-15T20:00:00Z')), fire.video);
  assert.notEqual(fire.video, fire.winterVideo);
});
