'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEvent, createEvent } = require('../lib/create.js');

test('Termin: mit Uhrzeit, Ende eine Stunde später, Gäste bereinigt', () => {
  assert.deepEqual(buildEvent({ summary: ' Essen ', start: '2026-11-12T18:30', attendees: ['A@b.de', 'a@b.de ', 'c@d.de'] }), {
    summary: 'Essen', start: { dateTime: '2026-11-12T18:30:00', timeZone: 'Europe/Berlin' }, end: { dateTime: '2026-11-12T19:30:00', timeZone: 'Europe/Berlin' }, attendees: [{ email: 'a@b.de' }, { email: 'c@d.de' }],
  });
});

test('Termin: ganztägig und mehrtägig, letzter Tag zählt mit', () => {
  assert.deepEqual(buildEvent({ summary: 'X', date: '2026-12-31' }).end, { date: '2027-01-01' });
  assert.deepEqual(buildEvent({ summary: 'X', date: '2026-11-12', endDate: '2026-11-14' }).end, { date: '2026-11-15' });
});

test('Termin: falsche Eingaben werden abgewiesen', () => {
  assert.throws(() => buildEvent({ date: '2026-11-12' }), /Titel/);
  assert.throws(() => buildEvent({ summary: 'X' }), /nötig/);
  assert.throws(() => buildEvent({ summary: 'X', date: '2026-11-12', start: '2026-11-12T10:00' }), /Entweder/);
  assert.throws(() => buildEvent({ summary: 'X', start: '2026-11-12T10:00', end: '2026-11-12T09:00' }), /nach dem Beginn/);
  assert.throws(() => buildEvent({ summary: 'X', date: '2026-11-12', attendees: ['kaputt'] }), /kaputt/);
  assert.throws(() => buildEvent({ summary: 'X', date: '2026-11-12', attendees: Array.from({ length: 31 }, (_, i) => `g${i}@b.de`) }), /Höchstens/);
});

test('Anlegen: Einladung nur mit Gästen, Probelauf sendet nichts', async () => {
  process.env.BH_FAMILY_CALENDAR_ID = 'fam@group';
  const calls = []; const api = async (m, u, b) => { calls.push([m, u, b]); return { status: 200, data: { id: '1', htmlLink: 'l', summary: b.summary } }; };
  assert.equal((await createEvent({ summary: 'X', date: '2026-11-12', attendees: ['a@b.de'], dryRun: true }, api)).dryRun, true);
  assert.equal(calls.length, 0);
  assert.deepEqual((await createEvent({ summary: 'X', date: '2026-11-12', attendees: ['a@b.de'] }, api)).invited, ['a@b.de']);
  assert.match(calls[0][1], /fam%40group\/events\?sendUpdates=all$/);
  await createEvent({ summary: 'X', date: '2026-11-12' }, api);
  assert.match(calls[1][1], /sendUpdates=none$/);
  await assert.rejects(createEvent({ summary: 'X', date: '2026-11-12' }, async () => ({ status: 403, data: {} })), /403/);
});
