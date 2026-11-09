'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { select, upcoming } = require('../lib/work.js');
const now = new Date('2026-11-09T10:00:00+01:00');
const at = (t) => ({ dateTime: t });

test('work calendar: only one-off meetings that block time', () => {
  const out = select([
    { summary: 'Notar', start: at('2026-11-10T09:00:00Z'), end: at('2026-11-10T10:00:00Z') },
    { summary: 'Jour fixe', recurringEventId: 'r', start: at('2026-11-10T11:00:00Z') },
    { summary: 'Blocker', transparency: 'transparent', start: at('2026-11-10T12:00:00Z') },
    { summary: 'Abgelehnt', attendees: [{ self: true, responseStatus: 'declined' }], start: at('2026-11-10T13:00:00Z') },
    { summary: 'Büro', eventType: 'workingLocation', start: { date: '2026-11-10' } },
    { summary: 'Geheim', visibility: 'private', start: at('2026-11-11T09:00:00Z') },
  ], now);
  assert.deepEqual(out.map((e) => e.title), ['Notar', 'Privater Termin']);
});

test('work calendar: owner comes with the result, missing setup is reported', async () => {
  process.env.BH_WORK_CALENDAR_ID = 'a@b'; process.env.BH_WORK_CALENDAR_OWNER = 'Max@Beispiel.de';
  assert.deepEqual(await upcoming(now, async () => ({ status: 200, data: { items: [] } })), { owner: 'max@beispiel.de', events: [] });
  delete process.env.BH_WORK_CALENDAR_ID;
  await assert.rejects(upcoming(now, async () => assert.fail()), /not configured/);
  delete process.env.BH_WORK_CALENDAR_OWNER;
});
