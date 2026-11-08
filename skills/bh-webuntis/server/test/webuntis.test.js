'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const w = require('../lib/webuntis.js');

process.env.BH_WEBUNTIS_SERVER = 'x.example'; process.env.BH_WEBUNTIS_SCHOOL = 's'; process.env.BH_WEBUNTIS_USER = 'u'; process.env.BH_WEBUNTIS_PASSWORD = 'p#1';
const res = (body, status = 200, cookies = []) => ({ ok: status < 400, status, headers: { getSetCookie: () => cookies }, json: async () => body, text: async () => body });
const entry = (o) => ({ duration: { start: '2026-11-09T08:00', end: '2026-11-09T09:30' }, status: 'REGULAR', type: 'NORMAL_TEACHING_PERIOD', position1: [{ current: { type: 'SUBJECT', shortName: 'Ek', longName: 'Erdkunde' } }], position2: [{ current: { type: 'TEACHER', shortName: 'Mei' } }], position3: [{ current: { type: 'ROOM', shortName: 'A1' } }], ...o });

test('Schultag: ab 16 Uhr der nächste, am Wochenende der Montag', () => {
  assert.equal(w.schoolDate(new Date('2026-11-09T14:00:00+01:00')), '2026-11-09');
  assert.equal(w.schoolDate(new Date('2026-11-09T16:30:00+01:00')), '2026-11-10');
  assert.equal(w.schoolDate(new Date('2026-11-13T17:00:00+01:00')), '2026-11-16');
  assert.equal(w.schoolDate(new Date('2026-11-08T10:00:00+01:00')), '2026-11-09');
  assert.equal(w.label('2026-11-09', new Date('2026-11-09T07:00:00+01:00')), 'Heute');
  assert.equal(w.label('2026-11-10', new Date('2026-11-09T17:00:00+01:00')), 'Morgen');
  assert.equal(w.label('2026-11-16', new Date('2026-11-13T17:00:00+01:00')), 'Montag');
});

test('Stunde: Ausfall, Vertretung und Raumwechsel werden erkannt, Lehrkraft nicht ausgegeben', () => {
  assert.equal(w.lesson(entry()).state, 'regular');
  assert.equal(w.lesson(entry({ status: 'CANCELLED' })).state, 'cancelled');
  assert.equal(w.lesson(entry({ status: 'SUBSTITUTION' })).state, 'changed');
  assert.equal(w.lesson(entry({ position3: [{ current: { type: 'ROOM', shortName: 'B2' }, removed: { type: 'ROOM', shortName: 'A1' } }] })).state, 'changed');
  assert.equal(w.lesson(entry({ type: 'EXAM' })).exam, true);
  assert.doesNotMatch(JSON.stringify(w.lesson(entry())), /Mei/);
});

test('Tag: Anmeldung mit Cookie, je Kind Plan mit Vornamen', async () => {
  const seen = [];
  w.setFetch(async (u, o = {}) => {
    seen.push([u, o]);
    if (u.endsWith('?school=s')) return res('', 200, ['JSESSIONID=abc; Path=/']);
    if (u.endsWith('j_spring_security_check')) return res({ state: 'SUCCESS' });
    if (u.endsWith('token/new')) return res('tok');
    if (u.endsWith('app/data')) return res({ user: { students: [{ id: 1, displayName: 'Muster Anna' }] } });
    return res({ days: [{ gridEntries: [entry({ duration: { start: '2026-11-09T10:00', end: '2026-11-09T11:00' } }), entry()] }] });
  });
  const d = await w.day('2026-11-09');
  assert.equal(d.kids[0].name, 'Anna'); assert.deepEqual(d.kids[0].lessons.map((l) => l.from), ['08:00', '10:00']);
  const login = seen.find(([u]) => u.endsWith('j_spring_security_check'));
  assert.equal(login[1].headers.cookie, 'JSESSIONID=abc'); assert.equal(login[1].body.get('j_password'), 'p#1');
  assert.match(seen.at(-1)[0], /resources=1/); assert.equal(seen.at(-1)[1].headers.authorization, 'Bearer tok');
  await assert.rejects(w.day('morgen'), /JJJJ/);
});

test('Tag: abgelehnte Anmeldung wird gemeldet und nicht weiter versucht', async () => {
  let calls = 0;
  w.setFetch(async (u) => { calls++; return u.endsWith('check') ? res({ state: 'FAILED' }) : res(''); });
  await assert.rejects(w.day('2026-11-09'), /Anmeldung/);
  assert.equal(calls, 2);
});
