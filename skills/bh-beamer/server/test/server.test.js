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

test('Werkzeuge', () => assert.deepEqual([...require('../tools/index.js').TOOL_NAMES].sort(), ['media_state', 'open_app', 'play_media', 'play_radio', 'play_youtube', 'power', 'press', 'share_answer', 'share_start', 'show_text', 'show_url', 'status', 'stop_media', 'stop_radio']));

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

function restFake(name, visibleAfter = 1) {
  const calls = []; let gets = 0;
  r.setRest(async (method, id) => { calls.push([method, id]); if (method === 'POST') return { status: 200, json: {} }; gets++; return { status: 200, json: { name, visible: gets > visibleAfter } }; });
  return calls;
}

test('App starten: echter Name wird vorher geprueft, fremde App wird nie gestartet', async () => {
  let calls = restFake('YouTube');
  await r.openApp('YouTube', { tries: 2, delayMs: 1 });
  assert.deepEqual(calls[1], ['POST', '111299001912']);
  calls = restFake('Netflix');
  await assert.rejects(r.openApp('YouTube', { tries: 1, delayMs: 1 }), /nicht installiert/);
  assert.equal(calls.filter((c) => c[0] === 'POST').length, 0);
  await assert.rejects(r.openApp('Tetris'), /Unbekannte App/);
});

test('Entwickler-App: Start gilt mit Antwort true oder Timeout als Erfolg, Ausfall bleibt Fehler', async () => {
  const dev = (postResult) => { const calls = []; r.setRest(async (m, id) => { calls.push([m, id]); if (m === 'POST') return postResult(); return { status: 200, json: { name: 'BH Screen', running: false, visible: false } }; }); return calls; };
  let calls = dev(() => ({ status: 200, json: true }));
  assert.equal(await r.openApp('BH Screen', { tries: 1, delayMs: 1 }), 'started');
  assert.ok(calls.filter((c) => c[0] === 'GET').length <= 3);
  dev(() => { throw new Error('timeout'); });
  assert.equal(await r.openApp('BH Screen', { tries: 1, delayMs: 1 }), 'running');
  dev(() => { throw new Error('Beamer ist aus oder nicht erreichbar'); });
  await assert.rejects(r.openApp('BH Screen', { tries: 1, delayMs: 1 }), /nicht erreichbar/);
  dev(() => ({ status: 200, json: {} }));
  await assert.rejects(r.openApp('BH Screen', { tries: 1, delayMs: 1 }), /liess sich nicht starten/);
  calls = dev(() => ({ status: 200, json: true }));
  await r.openApp('BH Screen', { tries: 1, delayMs: 1, restart: true });
  assert.deepEqual(calls.slice(1, 3).map((c) => c[0]), ['DELETE', 'POST']);
});

test('YouTube per DIAL: Kennung aus Adresse, Origin-Kopf, Fehler gemeldet', async () => {
  process.env.BH_BEAMER_IP = '10.0.0.5';
  const d = require('../lib/dial.js');
  for (const u of ['jNQXAC9IVRw', 'https://www.youtube.com/watch?v=jNQXAC9IVRw&t=3s', 'https://youtu.be/jNQXAC9IVRw?si=x', 'https://m.youtube.com/shorts/jNQXAC9IVRw', 'https://www.youtube-nocookie.com/embed/jNQXAC9IVRw']) assert.equal(d.videoId(u), 'jNQXAC9IVRw');
  for (const u of ['https://vimeo.com/123', 'https://www.youtube.com/', 'javascript:alert(1)', 'abc', '']) assert.throws(() => d.videoId(u), /YouTube/);
  const calls = [];
  d.setFetch(async (u, o = {}) => { calls.push([u, o]); return { status: 201, text: async () => '<state>running</state>' }; });
  assert.equal(await d.playYoutube('https://youtu.be/jNQXAC9IVRw'), 'jNQXAC9IVRw');
  assert.equal(calls[0][0], 'http://10.0.0.5:8080/ws/apps/YouTube');
  assert.equal(calls[0][1].headers.origin, 'https://www.youtube.com'); assert.equal(calls[0][1].body, 'v=jNQXAC9IVRw');
  assert.equal(await d.youtubeState(), 'running');
  d.setFetch(async () => ({ status: 403, text: async () => '' }));
  await assert.rejects(d.playYoutube('jNQXAC9IVRw'), /403/);
  d.setFetch(async () => { throw new Error('ECONNREFUSED'); });
  await assert.rejects(d.playYoutube('jNQXAC9IVRw'), /nicht erreichbar/);
});

test('Browser: Start ueber die App, Adresse wird nachgereicht, fremde App nie', async () => {
  const calls = restFake('Internet', 1);
  const sent = [];
  r.setOpener(async (_p, onText) => { setImmediate(() => onText(JSON.stringify({ event: 'ms.channel.connect', data: {} }))); return { send: (t) => sent.push(JSON.parse(t).params.data), close() {} }; });
  await r.launchBrowser('https://a.de/', { tries: 2, delayMs: 1 });
  assert.deepEqual(calls.find((c) => c[0] === 'POST'), ['POST', '3201907018784']);
  assert.equal(sent[0].metaTag, 'https://a.de/');
  r.setRest(async () => ({ status: 200, json: { name: 'Netflix' } }));
  sent.length = 0;
  await assert.rejects(r.launchBrowser('https://a.de/', { tries: 1, delayMs: 1 }), /nicht installiert/);
  assert.equal(sent.length, 0);
});

test('Text: mit App BH Screen direkt, sonst als Bild (erst https, dann http)', async () => {
  process.env.BH_SCREEN_URL = 'https://x/screen/t'; process.env.BH_AUTH_INTERNAL = 'http://x'; process.env.BH_SCREEN_WRITE = 'W';
  const realFetch = global.fetch; const sent = []; global.fetch = async (_u, o) => { sent.push(JSON.parse(o.body)); return { ok: true }; };
  const { showText, showUrl } = require('../lib/screen.js');
  try {
    const opened = [];
    const withApp = { isInstalled: async () => true, openApp: async (a, o) => opened.push([a, o]), launchBrowser: async () => assert.fail('kein Browser') };
    assert.equal(await showText('Hallo', '', { remote: withApp, waitMs: 1 }), 'app');
    assert.deepEqual(sent.at(-1), { mode: 'text', title: 'Hallo', text: '' }); assert.deepEqual(opened.at(-1), ['BH Screen', undefined]);
    assert.equal(await showUrl('https://a.de/x', { remote: withApp }), 'app');
    assert.deepEqual(sent.at(-1), { mode: 'url', url: 'https://a.de/x' }); assert.deepEqual(opened.at(-1), ['BH Screen', { restart: true }]);
    await assert.rejects(showUrl('http://a.de', { remote: withApp }), /https/);
    const urls = []; let states = ['STOPPED', 'PLAYING'];
    const noApp = { isInstalled: async () => false, launchBrowser: async (u) => urls.push('browser:' + u) };
    const dlna = { play: async (u, _t, kind) => { assert.equal(kind, 'image'); urls.push(u); }, state: async () => states.shift() };
    assert.equal(await showText('Hallo', '', { remote: noApp, dlna, waitMs: 1 }), 'stream');
    assert.match(urls[0], /^https:.*image\.jpg\?v=/); assert.match(urls[1], /^http:/);
    assert.equal(await showUrl('https://a.de/', { remote: noApp }), 'browser'); assert.equal(urls.at(-1), 'browser:https://a.de/');
    states = ['STOPPED', 'STOPPED'];
    await assert.rejects(showText('Hallo', '', { remote: noApp, dlna, waitMs: 1 }), /nicht angenommen/);
  } finally { global.fetch = realFetch; }
});

test('Radio: nur https, App wird gestartet, nach Webseite neu gestartet', async () => {
  process.env.BH_AUTH_INTERNAL = 'http://x'; process.env.BH_SCREEN_WRITE = 'W';
  const { playRadio, showText } = require('../lib/screen.js');
  const realFetch = global.fetch; let previous = 'text'; const sent = [];
  global.fetch = async (_u, o) => { sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ previous }) }; };
  try {
    const opened = []; const remote = { isInstalled: async () => true, openApp: async (a, o) => opened.push([a, o]) };
    await playRadio('https://r.de/s.mp3', 'NDR 2', { remote });
    assert.deepEqual(sent.at(-1), { mode: 'audio', url: 'https://r.de/s.mp3', title: 'NDR 2' }); assert.deepEqual(opened.at(-1), ['BH Screen', undefined]);
    previous = 'url';
    await playRadio('https://r.de/s.mp3', 'NDR 2', { remote }); assert.deepEqual(opened.at(-1), ['BH Screen', { restart: true }]);
    await showText('Hallo', '', { remote }); assert.deepEqual(opened.at(-1), ['BH Screen', { restart: true }]);
    await assert.rejects(playRadio('http://r.de/s.mp3', 'x', { remote }), /https/);
    await assert.rejects(playRadio('https://r.de/s.mp3', 'x', { remote: { isInstalled: async () => false } }), /BH Screen/);
  } finally { global.fetch = realFetch; }
});

test('Freigabe: Angebot geht an den Dienst, App kommt nach vorn, Antwort wird abgeholt', async () => {
  process.env.BH_AUTH_INTERNAL = 'http://x'; process.env.BH_SCREEN_WRITE = 'W';
  const { shareStart, shareAnswer } = require('../lib/screen.js');
  const realFetch = global.fetch; const sent = [];
  global.fetch = async (_u, o) => { sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ previous: 'url', session: 'abc' }) }; };
  try {
    const opened = []; const remote = { isInstalled: async () => true, openApp: async (a, o) => opened.push([a, o]) };
    assert.equal(await shareStart('v=0', { remote }), 'abc');
    assert.deepEqual(sent.at(-1), { mode: 'share', offer: 'v=0' }); assert.deepEqual(opened.at(-1), ['BH Screen', { restart: true }]);
    await assert.rejects(shareStart('v=0', { remote: { isInstalled: async () => false } }), /BH Screen/);
  } finally { global.fetch = realFetch; }
  let seen;
  assert.equal(await shareAnswer('a b', async (u, o) => { seen = [u, o]; return { ok: true, json: async () => ({ answer: 'v=0 x' }) }; }), 'v=0 x');
  assert.match(seen[0], /session=a%20b/); assert.equal(seen[1].headers.authorization, 'Bearer W');
  assert.equal(await shareAnswer('a', async () => ({ ok: true, json: async () => ({ answer: null }) })), '');
  await assert.rejects(shareAnswer('a', async () => ({ ok: false, status: 401 })), /401/);
});

test('Power: Erfolg nur mit bestaetigtem Zustand, Wecken mit Magic Packet', async () => {
  const p = require('../lib/power.js');
  const pkt = p.magicPacket('04:B9:E3:60:B7:18');
  assert.equal(pkt.length, 102); assert.equal(pkt.subarray(0, 6).toString('hex'), 'ffffffffffff'); assert.equal(pkt.subarray(96).toString('hex'), '04b9e360b718');
  assert.throws(() => p.magicPacket(''), /MAC/);
  const fake = (states) => { const held = []; return { held, hold: async (k) => held.push(k), press: async (k) => held.push('press:' + k), status: async () => { const s = states.length > 1 ? states.shift() : states[0]; if (s === 'down') throw new Error('x'); return { device: { PowerState: s } }; } }; };
  let remote = fake(['on', 'standby']);
  assert.match(await p.powerOff({ remote, tries: 2, delayMs: 1 }), /ist aus/); assert.deepEqual(remote.held, ['KEY_POWER']);
  remote = fake(['on']);
  await assert.rejects(p.powerOff({ remote, tries: 2, delayMs: 1 }), /noch an/);
  remote = fake(['standby']);
  assert.match(await p.powerOff({ remote, tries: 1, delayMs: 1 }), /bereits aus/); assert.deepEqual(remote.held, []);
  let woken = 0;
  remote = fake(['down', 'on']);
  assert.match(await p.powerOn({ remote, wake: async () => { woken++; }, tries: 2, delayMs: 1 }), /ist an/); assert.equal(woken, 1); assert.deepEqual(remote.held, []);
  remote = fake(['standby', 'on']);
  await p.powerOn({ remote, wake: async () => {}, tries: 2, delayMs: 1 }); assert.deepEqual(remote.held, ['press:KEY_POWER']);
  remote = fake(['down']);
  await assert.rejects(p.powerOn({ remote, wake: async () => {}, tries: 2, delayMs: 1 }), /Fernbedienung/);
  remote = fake(['on']);
  assert.match(await p.powerOn({ remote, wake: async () => assert.fail('nicht wecken'), tries: 1, delayMs: 1 }), /bereits an/);
});

test('Anzeige: nur https, Inhalt geht mit Schreib-Schluessel an den Dienst', async () => {
  process.env.BH_AUTH_INTERNAL = 'http://x'; process.env.BH_SCREEN_WRITE = 'W';
  const s = require('../lib/screen.js');
  assert.throws(() => s.httpsUrl('http://a.de'), /https/);
  assert.throws(() => s.httpsUrl('javascript:alert(1)'), /https/);
  let seen;
  await s.setContent({ mode: 'text', title: 'Hallo', text: 'Text' }, async (u, o) => { seen = [u, o]; return { ok: true }; });
  assert.equal(seen[0], 'http://x/screen-update'); assert.equal(seen[1].headers.authorization, 'Bearer W');
  await assert.rejects(s.setContent({ title: 'a' }, async () => ({ ok: false, status: 401 })), /401/);
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
  await d.play('https://radio.example/stream.mp3', 'Radio', 'audio');
  assert.match(calls.filter((c) => c[1].method === 'POST').at(-2)[1].body, /audioBroadcast/);
  await assert.rejects(d.play('file:///etc/passwd'), /http/);
  d.setFetch(async (u) => (u.endsWith('/dmr') ? { ok: true, text: async () => '' } : { ok: true }));
  await assert.rejects(d.stop(), /keine Medienwiedergabe/);
});

