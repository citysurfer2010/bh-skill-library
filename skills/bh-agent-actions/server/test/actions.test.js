'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('Aktion wird ueber einen Wunsch gefunden', async () => {
  const { TOOLS } = require(path.join(__dirname, '../tools/index.js'));
  const r = await TOOLS.find.handler({ question: 'Mach das Wohnzimmer wärmer, Temperatur ändern' });
  assert.equal(JSON.parse(r.content[0].text)[0].id, 'set-room-temperature');
  assert.match((await TOOLS.lookup.handler({ action: 'create-family-event' })).content[0].text, /dryRun/);
  assert.equal((await TOOLS.lookup.handler({ action: '../x' })).isError, true);
});
