/** Remote control of a Samsung Beamer via its encrypted interface (port 8002). */
'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const https  = require('https');
const os     = require('os');
const path   = require('path');
const tls    = require('tls');

const PORT = 8002;
const NAME = Buffer.from('BH Platform').toString('base64');
const CONFIRM_MS = 30_000;
const KEYS = ['KEY_POWER', 'KEY_VOLUP', 'KEY_VOLDOWN', 'KEY_MUTE', 'KEY_HOME', 'KEY_RETURN', 'KEY_UP', 'KEY_DOWN', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_ENTER', 'KEY_PLAY', 'KEY_PAUSE', 'KEY_SOURCE'];

const tokenFile = () => path.join(process.env.HOME || os.homedir(), '.config', 'bh-beamer', 'token');
function readToken() { try { return fs.readFileSync(tokenFile(), 'utf8').trim(); } catch { return ''; } }
function saveToken(t) { fs.mkdirSync(path.dirname(tokenFile()), { recursive: true, mode: 0o700 }); fs.writeFileSync(tokenFile(), String(t), { mode: 0o600 }); }

// The Beamer brings its own certificate: pinned and compared exactly.
function tlsOptions() {
  const fingerprint = process.env.BH_BEAMER_FP;
  return {
    ca: Buffer.from(process.env.BH_BEAMER_CA_B64 || '', 'base64').toString('utf8'),
    checkServerIdentity: (_h, cert) => (cert.fingerprint256 === fingerprint ? undefined : new Error('Zertifikat des Beamers stimmt nicht')),
  };
}

function encodeText(text) {
  const payload = Buffer.from(text); const mask = crypto.randomBytes(4);
  const head = payload.length < 126 ? Buffer.from([0x81, 0x80 | payload.length]) : Buffer.from([0x81, 0x80 | 126, payload.length >> 8, payload.length & 255]);
  return Buffer.concat([head, mask, payload.map((b, i) => b ^ mask[i % 4])]);
}

/** Splits received data into text messages; incomplete remainders stay in place. */
function decodeFrames(buffer) {
  const texts = []; let at = 0;
  while (buffer.length - at >= 2) {
    const opcode = buffer[at] & 15; let len = buffer[at + 1] & 127; let start = at + 2;
    if (len === 126) { if (buffer.length - at < 4) break; len = buffer.readUInt16BE(at + 2); start = at + 4; }
    else if (len === 127) { if (buffer.length - at < 10) break; len = Number(buffer.readBigUInt64BE(at + 2)); start = at + 10; }
    if (buffer.length < start + len) break;
    if (opcode === 1) texts.push(buffer.subarray(start, start + len).toString('utf8'));
    at = start + len;
  }
  return { texts, rest: buffer.subarray(at) };
}

function realOpen(urlPath, onText) {
  return new Promise((resolve, reject) => {
    const host = process.env.BH_BEAMER_IP;
    const socket = tls.connect({ ...tlsOptions(), host, port: PORT, timeout: 10_000 }, () => {
      socket.write(`GET ${urlPath} HTTP/1.1\r\nHost: ${host}:${PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\n\r\n`);
    });
    let open = false; let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!open) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        if (!/^HTTP\/1\.1 101/.test(buffer.toString('latin1', 0, end))) { socket.destroy(); reject(new Error('Der Beamer lehnt die Verbindung ab')); return; }
        open = true; buffer = buffer.subarray(end + 4);
        resolve({ send: (t) => socket.write(encodeText(t)), close: () => socket.destroy() });
      }
      const { texts, rest } = decodeFrames(buffer); buffer = rest; texts.forEach(onText);
    });
    socket.on('timeout', () => socket.destroy(new Error('Beamer antwortet nicht')));
    socket.on('error', () => { if (!open) reject(new Error('Beamer ist aus oder nicht erreichbar')); });
  });
}

let opener = realOpen;
const setOpener = (fn) => { opener = fn; };

/** Opens the remote-control connection, waits for approval on the Beamer and runs work. */
async function withChannel(work, onEvent = () => {}) {
  const token = readToken();
  let ready; let refuse;
  const connected = new Promise((res, rej) => { ready = res; refuse = rej; });
  const socket = await opener(`/api/v2/channels/samsung.remote.control?name=${NAME}${token ? `&token=${token}` : ''}`, (text) => {
    let m; try { m = JSON.parse(text); } catch { return; }
    if (m.event === 'ms.channel.connect') { if (m.data?.token) saveToken(m.data.token); ready(); }
    if (m.event === 'ms.channel.unauthorized' || m.event === 'ms.channel.timeOut') refuse(new Error('Zugriff am Beamer nicht erlaubt'));
    onEvent(m);
  });
  const timer = setTimeout(() => refuse(new Error('Bitte die Abfrage am Beamer mit der Fernbedienung erlauben und erneut versuchen')), CONFIRM_MS);
  try {
    await connected;
    clearTimeout(timer);
    return await work(socket);
  } finally { clearTimeout(timer); socket.close(); }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function press(key) {
  if (!KEYS.includes(key)) throw new Error(`Unbekannte Taste: ${key}`);
  await withChannel(async (socket) => {
    socket.send(JSON.stringify({ method: 'ms.remote.control', params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' } }));
    await pause(300);
  });
}

// Confirmed by query on this Beamer. Before every start the real name is checked again.
const APPS = { 'BH Home': 'bhscreen01.BHScreen', YouTube: '111299001912', 'Prime Video': '3201910019365', Netflix: '3201907018807', 'Disney+': '3201901017640', 'Apple TV': '3201807016597', Spotify: '3201606009684', WOW: '3201411000562', Internet: '3201907018784' };

function realRest(method, id, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const req = https.request({ ...tlsOptions(), host: process.env.BH_BEAMER_IP, port: PORT, path: `/api/v2/applications/${id}`, method, timeout }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; });
      res.on('end', () => { let json = {}; try { json = JSON.parse(t); } catch { /* empty answer */ } resolve({ status: res.statusCode, json }); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => reject(new Error(e.message === 'timeout' ? 'timeout' : 'Beamer ist aus oder nicht erreichbar')));
    req.end();
  });
}
let rest = realRest;
const setRest = (fn) => { rest = fn; };

async function appInfo(app) {
  const id = APPS[app];
  if (!id) throw new Error(`Unbekannte App: ${app}`);
  const r = await rest('GET', id);
  if (r.status !== 200 || !String(r.json.name || '').startsWith(app.split(' ')[0])) throw new Error(`${app} ist auf dem Beamer nicht installiert`);
  return { id, ...r.json };
}

async function waitVisible(id, tries, delayMs) {
  for (let i = 0; i < tries; i++) {
    await pause(delayMs);
    if ((await rest('GET', id)).json.visible === true) return true;
  }
  return false;
}

const installedUntil = new Map();
// Installed stays installed: the result saves one query on every switch.
async function isInstalled(app) {
  if ((installedUntil.get(app) || 0) > Date.now()) return true;
  try { await appInfo(app); installedUntil.set(app, Date.now() + 600_000); return true; } catch { return false; }
}

// Developer apps installed via sdb (BH Home) never report `running`/`visible` to the REST endpoint.
// There the answer `true` to the start counts as success; if the app is already in the foreground, the
// Beamer does not answer the start at all (timeout) - that is no error either, it was reachable just now.
async function openApp(app, { tries = 8, delayMs = 750, restart = false } = {}) {
  const { id } = await appInfo(app);
  if (restart) { await rest('DELETE', id).catch(() => {}); await pause(1500); }
  let started = false; let busy = false;
  // Short limit: the Beamer does not answer the start of a running app and blocks all other queries meanwhile.
  try { started = (await rest('POST', id, 1500)).json === true; } catch (e) { if (e.message !== 'timeout') throw e; busy = true; }
  if (await waitVisible(id, started || busy ? 2 : tries, delayMs)) return 'visible';
  if (started) return 'started';
  if (busy) return 'running';
  throw new Error(`${app} liess sich nicht starten`);
}

/** Holds a key down (the only way to power off this model). */
async function hold(key, ms = 3000) {
  if (!KEYS.includes(key)) throw new Error(`Unbekannte Taste: ${key}`);
  const send = (socket, Cmd) => socket.send(JSON.stringify({ method: 'ms.remote.control', params: { Cmd, DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' } }));
  await withChannel(async (socket) => { send(socket, 'Press'); await pause(ms); send(socket, 'Release'); await pause(300); });
}

/** Starts the browser and passes the address. The Beamer does not report whether it loads it. */
async function launchBrowser(url, { tries = 6, delayMs = 750 } = {}) {
  await openApp('Internet', { tries, delayMs });
  const { id } = await appInfo('Internet');
  await withChannel(async (socket) => {
    socket.send(JSON.stringify({ method: 'ms.channel.emit', params: { event: 'ed.apps.launch', to: 'host', data: { appId: id, action_type: 'DEEP_LINK', metaTag: url } } }));
    await pause(500);
  });
}

function status() {
  return new Promise((resolve, reject) => {
    const req = https.get({ ...tlsOptions(), host: process.env.BH_BEAMER_IP, port: PORT, path: '/api/v2/', timeout: 6000 }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { try { resolve(JSON.parse(t)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => reject(new Error('Beamer ist aus oder nicht erreichbar')));
  });
}

const ok = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const guarded = (fn) => async (args) => { try { return ok(await fn(args || {})); } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } };

module.exports = { KEYS, APPS, press, hold, launchBrowser, openApp, isInstalled, setRest, status, encodeText, decodeFrames, setOpener, tlsOptions, guarded, tokenFile };
