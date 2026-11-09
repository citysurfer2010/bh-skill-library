'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { select, upcoming } = require('../lib/events.js');
const now = new Date('2026-11-09T10:00:00+01:00');

test('Termine: Serien und Abgesagtes fallen weg, Zeit in Berliner Zeit', () => {
  assert.deepEqual(select([
    { summary: 'Elternabend', start: { dateTime: '2026-11-12T17:30:00Z' }, end: { dateTime: '2026-11-12T19:00:00Z' } },
    { summary: 'Ausflug', start: { date: '2026-11-14' } },
    { summary: 'Turnen', recurringEventId: 'r', start: { dateTime: '2026-11-10T15:00:00Z' } },
    { summary: 'Weg', status: 'cancelled', start: { date: '2026-11-15' } },
    { summary: 'Ferien', start: { date: '2026-11-07' } },
  ], now), [{ date: '2026-11-12', time: '18:30', title: 'Elternabend', startAt: Date.parse('2026-11-12T17:30:00Z'), endAt: Date.parse('2026-11-12T19:00:00Z') }, { date: '2026-11-14', time: null, title: 'Ausflug' }, { date: '2026-11-09', time: null, title: 'Ferien' }]);
});

test('Termine: nur der eine Kalender, Serien aufgelöst, Fehler wird gemeldet', async () => {
  process.env.BH_FAMILY_CALENDAR_ID = 'fam@group';
  let seen;
  await upcoming(now, async (m, u) => { seen = u; return { status: 200, data: { items: [] } }; });
  assert.match(seen, /calendars\/fam%40group\/events/); assert.match(seen, /singleEvents=true/);
  await assert.rejects(upcoming(now, async () => ({ status: 403, data: {} })), /403/);
  delete process.env.BH_FAMILY_CALENDAR_ID;
  await assert.rejects(upcoming(now, async () => assert.fail()), /nicht eingerichtet/);
});
