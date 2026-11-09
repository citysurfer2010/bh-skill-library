'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('alle Werkzeuge laden, Namen sind eindeutig', () => {
  const { TOOL_NAMES, TOOL_SCHEMAS } = require('../tools/index.js');
  assert.ok(TOOL_NAMES.length > 50);
  assert.equal(new Set(TOOL_NAMES).size, TOOL_NAMES.length);
  for (const t of TOOL_SCHEMAS) assert.ok(t.description && t.inputSchema, t.name);
});

test('Anmeldung spricht nur Google an', () => {
  for (const f of ['lib/auth.js', 'lib/config.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), /geminicli|REFRESH_URL/);
  }
});

test('fehlende Anmeldung zerstoert nichts und meldet klar', async () => {
  process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-'));
  for (const k of Object.keys(require.cache)) if (k.includes('/lib/')) delete require.cache[k];
  const { getAccessToken } = require('../lib/auth.js');
  await assert.rejects(getAccessToken(), /credentials\.json/);
});

test('Dateischutz: erlaubt Arbeitsordner, sperrt Schluessel', () => {
  const home = os.homedir();
  delete require.cache[require.resolve('../lib/local-file-guard.cjs')];
  const guard = require('../lib/local-file-guard.cjs');
  fs.mkdirSync(path.join(os.tmpdir(), 'bh-g'), { recursive: true });
  const ok = path.join(os.tmpdir(), 'bh-g', 'a.pdf'); fs.writeFileSync(ok, 'x');
  assert.equal(guard.checkReadablePath(ok).ok, true);
  assert.equal(guard.checkReadablePath('/etc/passwd').ok, false);
  assert.equal(guard.checkReadablePath(path.join(home, '.ssh', 'id_ed25519')).ok, false);
});


test('Kalender: Termin kennt ganztägig und Wiederholung', () => {
  const props = require('../tools/calendar/create-event.js').inputSchema.properties;
  for (const k of ['startDate', 'endDate', 'recurrence', 'transparency']) assert.ok(props[k], k);
});
