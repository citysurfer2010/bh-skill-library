'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-'));
const r = require('../lib/remote.js');

function fake(events) {
  const sent = []; const paths = []; let closed = 0;
  r.setOpener(async (p, onText) => { paths.push(p); setImmediate(() => events.forEach((e) => onText(JSON.stringify(e)))); return { send: (t) => sent.push(JSON.parse(t)), close: () => { closed++; } }; });
  return { sent, paths, closed: () => closed };
}

test('Werkzeuge', () => assert.deepEqual([...require('../tools/index.js').TOOL_NAMES].sort(), ['press', 'status']));

test('Frames: verschluesselt gesendet, Nachrichten werden erkannt', () => {
  const f = r.encodeText('hi');
  assert.equal(f[0], 0x81); assert.equal(f[1] & 0x80, 0x80);
  const mask = f.subarray(2, 6); assert.equal(Buffer.from(f.subarray(6).map((b, i) => b ^ mask[i % 4])).toString(), 'hi');
  const frame = Buffer.concat([Buffer.from([0x81, 2]), Buffer.from('ok'), Buffer.from([0x81, 5, 1])]);
  const d = r.decodeFrames(frame);
  assert.deepEqual(d.texts, ['ok']); assert.equal(d.rest.length, 3);
});

test('Taste: Token wird beim ersten Mal gespeichert und danach mitgeschickt', async () => {
  let f = fake([{ event: 'ms.channel.connect', data: { token: '123' } }]);
  await r.press('KEY_MUTE');
  assert.equal(f.sent[0].params.DataOfCmd, 'KEY_MUTE'); assert.equal(f.closed(), 1);
  assert.doesNotMatch(f.paths[0], /token=/);
  assert.equal(fs.statSync(r.tokenFile()).mode & 0o777, 0o600);
  f = fake([{ event: 'ms.channel.connect', data: {} }]);
  await r.press('KEY_HOME');
  assert.match(f.paths[0], /token=123/);
});

test('Unbekannte Taste und Ablehnung am Beamer', async () => {
  await assert.rejects(r.press('KEY_FACTORY'), /Unbekannte Taste/);
  const f = fake([{ event: 'ms.channel.unauthorized' }]);
  await assert.rejects(r.press('KEY_MUTE'), /nicht erlaubt/);
  assert.equal(f.sent.length, 0); assert.equal(f.closed(), 1);
});

test('TLS bleibt pruefpflichtig, Zertifikat wird verglichen', () => {
  process.env.BH_BEAMER_FP = 'AA'; const o = r.tlsOptions();
  assert.equal(o.rejectUnauthorized, undefined);
  assert.equal(o.checkServerIdentity('x', { fingerprint256: 'AA' }), undefined);
  assert.ok(o.checkServerIdentity('x', { fingerprint256: 'BB' }) instanceof Error);
});
