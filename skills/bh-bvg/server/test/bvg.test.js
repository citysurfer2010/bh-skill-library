'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const b = require('../lib/bvg.js');
const res = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('Haltestellen: nur Stops, Eingabe wird geprüft', async () => {
  let seen;
  b.setFetch(async (u) => { seen = u; return res([{ type: 'stop', id: '900024104', name: 'Amtsgerichtsplatz' }, { type: 'location', id: 'x' }]); });
  assert.deepEqual(await b.stops('Amtsgerichtsplatz'), [{ id: '900024104', name: 'Amtsgerichtsplatz' }]);
  assert.match(seen, /query=Amtsgerichtsplatz/);
  await assert.rejects(b.stops(' '), /fehlt/);
});

test('Abfahrten: Verspätung in Minuten, Ausfall, Kennung geprüft, Fehler gemeldet', async () => {
  b.setFetch(async () => res({ departures: [{ line: { name: 'M49' }, direction: 'Staaken', when: 'x', delay: 120 }, { line: { name: '309' }, direction: 'A', when: null, plannedWhen: 'y', cancelled: true }] }));
  const d = await b.departures('900024104');
  assert.equal(d[0].line, 'M49'); assert.equal(d[0].delayMinutes, 2); assert.equal(d[1].cancelled, true); assert.equal(d[1].when, 'y');
  await assert.rejects(b.departures('../x'), /ungültig/);
  b.setFetch(async () => res({}, 503));
  await assert.rejects(b.departures('900024104'), /503/);
  b.setFetch(async () => { throw new Error('x'); });
  await assert.rejects(b.departures('900024104'), /nicht erreichbar/);
});
