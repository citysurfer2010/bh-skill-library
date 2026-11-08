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

test('Werkzeuge', () => assert.deepEqual([...require('../tools/index.js').TOOL_NAMES].sort(), ['media_state', 'play_media', 'press', 'show_text', 'show_url', 'status', 'stop_media']));

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

test('Browser: naechster Name, wenn der erste nicht startet, Fehler wenn keiner geht', async () => {
  const sent = [];
  r.setOpener(async (_p, onText) => {
    setImmediate(() => onText(JSON.stringify({ event: 'ms.channel.connect', data: {} })));
    return { send: (t) => { const m = JSON.parse(t); sent.push(m.params.data.appId); setImmediate(() => onText(JSON.stringify({ event: 'ed.apps.launch', data: sent.length === 2 ? 200 : 404 }))); }, close() {} };
  });
  await r.launchBrowser('https://a.de/', 200);
  assert.deepEqual(sent, ['org.tizen.browser', '3201907018807']);
  sent.length = 5;
  await assert.rejects(r.launchBrowser('https://a.de/', 50), /nicht starten/);
});

test('Anzeige: nur https, Inhalt geht mit Schreib-Schluessel an den Dienst', async () => {
  process.env.BH_AUTH_INTERNAL = 'http://x'; process.env.BH_SCREEN_WRITE = 'W';
  const s = require('../lib/screen.js');
  assert.throws(() => s.httpsUrl('http://a.de'), /https/);
  assert.throws(() => s.httpsUrl('javascript:alert(1)'), /https/);
  let seen;
  await s.setContent('Hallo', 'Text', async (u, o) => { seen = [u, o]; return { ok: true }; });
  assert.equal(seen[0], 'http://x/screen-update'); assert.equal(seen[1].headers.authorization, 'Bearer W');
  await assert.rejects(s.setContent('a', 'b', async () => ({ ok: false, status: 401 })), /401/);
});

test('Stream: Steueradresse wird gefunden, Adresse maskiert, Fehler gemeldet', async () => {
  process.env.BH_BEAMER_IP = '10.0.0.5';
  const d = require('../lib/dlna.js');
  const calls = [];
  d.setFetch(async (u, o = {}) => {
    calls.push([u, o]);
    if (u.endsWith('/dmr')) return { ok: true, text: async () => '<service><serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType><controlURL>/x</controlURL></service><service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType><controlURL>/upnp/control/AVTransport1</controlURL></service>' };
    return { ok: true, text: async () => '<CurrentTransportState>PLAYING</CurrentTransportState>' };
  });
  await d.play('https://a.de/v.mp4?a=1&b=2', 'T<i>');
  const posts = calls.filter((c) => c[1].method === 'POST');
  assert.equal(posts[0][0], 'http://10.0.0.5:9197/upnp/control/AVTransport1');
  assert.match(posts[0][1].body, /a=1&amp;b=2/); assert.doesNotMatch(posts[0][1].body, /T<i>/);
  assert.match(posts[1][1].headers.soapaction, /#Play/);
  assert.equal(await d.state(), 'PLAYING');
  await assert.rejects(d.play('file:///etc/passwd'), /http/);
  d.setFetch(async (u) => (u.endsWith('/dmr') ? { ok: true, text: async () => '' } : { ok: true }));
  await assert.rejects(d.stop(), /keine Medienwiedergabe/);
});

