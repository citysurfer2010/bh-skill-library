'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLibrary } = require('../lib/library.js');
const skills = path.join(__dirname, '../../..');

test('Bibliothek: Liste, Volltext, Suche, keine Ausbrueche aus dem Ordner', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
  fs.writeFileSync(path.join(dir, 'kalender.md'), '---\ntitle: Kalender\nsummary: Termine\ntags: [familie]\n---\n\nText zum Geburtstag');
  fs.writeFileSync(path.join(dir, 'heizung.md'), '---\ntitle: Heizung\nsummary: Wärme\n---\n\nThermostat');
  const lib = createLibrary(dir);
  assert.deepEqual(lib.list().map((e) => e.id), ['heizung', 'kalender']);
  assert.match(lib.lookup('kalender'), /^# Kalender\n\nText/);
  assert.equal(lib.find('Geburtstag der Familie')[0].id, 'kalender');
  assert.deepEqual(lib.find('xyz'), []);
  for (const bad of ['../secret', 'a/b', '', null]) assert.throws(() => lib.lookup(bad), /Ungueltig/);
  assert.throws(() => lib.lookup('fehlt'), /Nicht gefunden/);
});

for (const [skill, folder] of [['bh-business-logic', 'topics'], ['bh-agent-actions', 'actions']]) {
  test(`${skill}: jeder Eintrag ist vollstaendig`, () => {
    const lib = createLibrary(path.join(skills, skill, folder));
    assert.ok(lib.all().length > 0);
    for (const e of lib.all()) { assert.ok(e.meta.title, e.id); assert.ok(e.meta.summary, e.id); assert.ok(e.body, e.id); }
  });
}

test('Rezepte nennen nur Werkzeuge, die es wirklich gibt', () => {
  const servers = JSON.parse(fs.readFileSync(path.join(skills, '../services/bh-mcp-gateway/servers.json'), 'utf8'));
  const list = Array.isArray(servers) ? servers : servers.servers;
  const known = new Set();
  for (const s of list) {
    const skill = /\/opt\/skills\/([^/]+)\//.exec(s.command[1])[1];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((f) => {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.js')) for (const m of fs.readFileSync(p, 'utf8').matchAll(/name: '([a-z_]+)'/g)) known.add(`${s.id}_${m[1]}`);
    });
    walk(path.join(skills, skill, 'server/tools'));
  }
  for (const e of createLibrary(path.join(skills, 'bh-agent-actions/actions')).all()) {
    for (const tool of [].concat(e.meta.tools || [])) assert.ok(known.has(tool), `${e.id}: ${tool}`);
  }
});

test('Werkzeuge beider Server werden geladen', () => {
  const load = (s) => [...require(path.join(skills, s, 'server/tools/index.js')).TOOL_NAMES].sort();
  assert.deepEqual(load('bh-business-logic'), ['find_topic', 'list_topics', 'lookup']);
  assert.deepEqual(load('bh-agent-actions'), ['find', 'list', 'lookup']);
});
