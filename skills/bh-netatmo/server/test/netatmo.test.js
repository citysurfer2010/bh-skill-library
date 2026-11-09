'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.BH_FAMILY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-netatmo-'));
process.env.BH_NETATMO_USER = 'u@beispiel.de'; process.env.BH_NETATMO_PASSWORD = 'geheim';
const n = require('../lib/netatmo.js');
const state = path.join(process.env.BH_FAMILY_DIR, 'netatmo.json');
const reply = (body, cookies = [], status = 200) => ({ ok: status < 400, status, headers: { getSetCookie: () => cookies, get: () => null }, json: async () => body });
function server(accept = true) {
  const seen = { logins: 0, api: 0 };
  const f = async (u, init) => {
    if (u.includes('/access/csrf')) return reply({ token: 't' });
    if (u.includes('/access/postlogin')) { seen.logins += 1; assert.match(String(init.body), /_token=t/); return reply({}, accept ? ['netatmocomaccess_token=abc%7C1; path=/'] : []); }
    if (u.includes('/access/login')) return reply({});
    seen.api += 1; assert.equal(init.headers.authorization, 'Bearer abc|1');
    if (u.includes('homesdata')) return reply({ body: { homes: [{ id: 'h', rooms: [{ id: '1', name: 'Küche', module_ids: ['v'] }] }] } });
    return reply({ body: { home: { rooms: [{ id: '1', reachable: true, therm_measured_temperature: 21, therm_setpoint_temperature: 19, therm_setpoint_mode: 'schedule', open_window: false, heating_power_request: 40 }], modules: [{ id: 'v', battery_state: 'low' }] } } });
  };
  return { f, seen };
}

test('Räume: Werte zusammengeführt, höchstens eine Anmeldung, Zwischenspeicher', async () => {
  fs.rmSync(state, { force: true });
  const { f, seen } = server(); n.setFetch(f);
  assert.deepEqual(await n.rooms(), [{ id: '1', name: 'Küche', temp: 21, target: 19, mode: 'schedule', heating: true, windowOpen: false, reachable: true, batteryLow: true }]);
  await n.rooms();
  assert.equal(seen.logins, 1); assert.equal(seen.api, 2);
  assert.equal(fs.statSync(state).mode & 0o777, 0o600);
  assert.doesNotMatch(fs.readFileSync(state, 'utf8'), /geheim/);
});

test('Abgelehnte Anmeldung sperrt weitere Versuche', async () => {
  fs.rmSync(state, { force: true });
  const { f, seen } = server(false); n.setFetch(f);
  await assert.rejects(n.rooms(), /lehnt/);
  await assert.rejects(n.rooms(), /gesperrt/);
  assert.equal(seen.logins, 1);
});

test('Solltemperatur: Grenzen, begrenzte Dauer, zurück zum Plan', async () => {
  fs.rmSync(state, { force: true });
  const sent = [];
  n.setFetch(async (u, init) => {
    if (u.includes('/access/csrf')) return reply({ token: 't' });
    if (u.includes('/access/postlogin')) return reply({}, ['netatmocomaccess_token=abc%7C1; path=/']);
    if (u.includes('/access/login')) return reply({});
    if (u.includes('homesdata')) return reply({ body: { homes: [{ id: 'h', therm_setpoint_default_duration: 60, therm_schedules: [{ id: 's', name: 'Arbeitswoche', selected: true }, { id: 'u', name: 'Urlaub' }], rooms: [{ id: '1', name: 'Küche', module_ids: [] }] }] } });
    if (u.includes('homestatus')) return reply({ body: { home: { rooms: [{ id: '1', reachable: true, therm_measured_temperature: 20, therm_setpoint_temperature: 21, therm_setpoint_mode: 'schedule' }], modules: [] } } });
    sent.push(JSON.parse(init.body)); return reply({ body: {} });
  });
  const s = await n.status();
  assert.equal(s.plan, 'Arbeitswoche'); assert.deepEqual(s.plans, ['Arbeitswoche', 'Urlaub']); assert.equal(s.mode, null);
  await assert.rejects(n.setRoom({ room: 'Küche', temp: 31 }), /7 bis 30/);
  await assert.rejects(n.setRoom({ room: 'Küche', temp: 20.3 }), /halben/);
  await assert.rejects(n.setRoom({ room: 'Mond', temp: 20 }), /nicht gefunden/);
  const now = Date.parse('2026-11-09T10:00:00Z');
  await n.setRoom({ room: 'Küche', temp: 22.5 }, now);
  assert.deepEqual(sent[0], { home_id: 'h', room_id: '1', mode: 'manual', temp: 22.5, endtime: now / 1000 + 3600 });
  await n.setRoom({ room: 'Küche', backToPlan: true });
  assert.deepEqual(sent[1], { home_id: 'h', room_id: '1', mode: 'home' });
});
