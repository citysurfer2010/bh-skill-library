'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-'));
const dsm = require('../lib/dsm.js');
const json = (o) => ({ type: 'application/json', body: Buffer.from(JSON.stringify(o)), truncated: false });
const text = (r) => r.content[0].text;
function connect() {
  const d = path.join(process.env.HOME, '.config/bh-nas'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, '.env'), 'BH_NAS_USER=anna\nBH_NAS_PASSWORD=ge=heim\n');
}
function fake(handler) {
  connect();
  const seen = [];
  dsm.setTransport(async (p, opts) => { seen.push({ ...p, opts }); return p.method === 'login' ? json({ success: true, data: { sid: 'S' + seen.length } }) : handler(p, seen, opts); });
  return seen;
}

test('nur Lesewerkzeuge', () => {
  assert.deepEqual([...require('../tools/index.js').TOOL_NAMES].sort(), ['list', 'list_shares', 'read_text', 'search']);
});

test('ohne Verbindung klare Meldung', async () => {
  dsm.setTransport(async () => assert.fail('kein Aufruf erwartet'));
  assert.match(text(await require('../tools/nas/list-shares.js').handler({})), /noch nicht verbunden/);
});

test('Anmeldung nutzt das Konto des Users', async () => {
  const seen = fake(() => json({ success: true, data: { shares: [] } }));
  await require('../tools/nas/list-shares.js').handler({});
  assert.equal(seen[0].account, 'anna'); assert.equal(seen[0].passwd, 'ge=heim');
});

test('TLS: Zertifikat wird exakt verglichen und bleibt pruefpflichtig', () => {
  process.env.BH_NAS_FP = 'AA:BB'; process.env.BH_NAS_CA_B64 = Buffer.from('PEM').toString('base64');
  const o = dsm.tlsOptions();
  assert.equal(o.ca, 'PEM'); assert.equal(o.rejectUnauthorized, undefined);
  assert.equal(o.checkServerIdentity('x', { fingerprint256: 'AA:BB' }), undefined);
  assert.ok(o.checkServerIdentity('x', { fingerprint256: 'CC:DD' }) instanceof Error);
});

test('Pfade: nur absolut und ohne Ausbruch', () => {
  for (const bad of ['Backup', '/a/../b', '', null, '/a\nb']) assert.throws(() => dsm.checkPath(bad), /Pfad/);
});

test('abgelaufene Sitzung: einmal neu anmelden', async () => {
  let n = 0;
  const seen = fake(() => (++n === 1 ? json({ success: false, error: { code: 119 } }) : json({ success: true, data: { shares: [{ name: 'A', path: '/A' }] } })));
  const r = await require('../tools/nas/list-shares.js').handler({});
  assert.deepEqual(JSON.parse(text(r)), [{ name: 'A', path: '/A' }]);
  assert.equal(seen.filter((s) => s.method === 'login').length, 2);
});

test('Fehler der Synology werden lesbar gemeldet', async () => {
  fake(() => json({ success: false, error: { code: 408 } }));
  const r = await require('../tools/nas/list.js').handler({ path: '/fehlt' });
  assert.equal(r.isError, true); assert.match(text(r), /nicht gefunden/);
});

test('Lesen: Grenze, Kuerzung, keine Binaerdateien', async () => {
  const read = require('../tools/nas/read-text.js');
  const seen = fake(() => ({ type: 'text/plain', body: Buffer.from('hallo'), truncated: true }));
  const r = JSON.parse(text(await read.handler({ path: '/a.txt' })));
  assert.equal(r.inhalt, 'hallo'); assert.equal(r.gekuerzt, true); assert.equal(seen.at(-1).opts.limit, 256 * 1024);
  fake(() => ({ type: 'application/octet-stream', body: Buffer.from([1, 0, 2]), truncated: false }));
  assert.match(text(await read.handler({ path: '/a.jpg' })), /keine Textdatei/);
});

test('Suche raeumt ihre Aufgabe auf', async () => {
  const seen = fake((p) => (p.method === 'start' ? json({ success: true, data: { taskid: 'T' } }) : p.method === 'list' ? json({ success: true, data: { finished: true, total: 1, files: [{ name: 'a.pdf', path: '/a.pdf', isdir: false }] } }) : json({ success: true, data: {} })));
  const r = JSON.parse(text(await require('../tools/nas/search.js').handler({ path: '/x', pattern: '*.pdf' })));
  assert.equal(r.files[0].name, 'a.pdf');
  assert.deepEqual(seen.filter((s) => ['stop', 'clean'].includes(s.method)).map((s) => s.method), ['stop', 'clean']);
});
