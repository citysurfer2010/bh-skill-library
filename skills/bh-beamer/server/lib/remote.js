/** Fernbedienung eines Samsung-Beamers ueber dessen verschluesselte Schnittstelle (Port 8002). */
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

// Der Beamer bringt ein eigenes Zertifikat mit: fest hinterlegt und exakt verglichen.
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

/** Zerlegt empfangene Daten in Textnachrichten; unvollstaendige Reste bleiben stehen. */
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

/** Oeffnet die Fernbedienungs-Verbindung, wartet auf die Freigabe am Beamer und fuehrt work aus. */
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

// Je nach Softwarestand heisst der Browser anders; der Beamer meldet, ob der Start geklappt hat.
const BROWSERS = ['org.tizen.browser'];

async function launchBrowser(url, waitMs = 4000) {
  let answer = () => {};
  await withChannel(async (socket) => {
    for (const appId of BROWSERS) {
      const result = new Promise((res) => { answer = res; setTimeout(() => res(null), waitMs); });
      socket.send(JSON.stringify({ method: 'ms.channel.emit', params: { event: 'ed.apps.launch', to: 'host', data: { appId, action_type: 'NATIVE_LAUNCH', metaTag: url } } }));
      if ((await result) === 200) return;
    }
    throw new Error('Der Browser des Beamers liess sich nicht starten');
  }, (m) => { if (m.event === 'ed.apps.launch') answer(m.data); });
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

module.exports = { KEYS, press, launchBrowser, status, encodeText, decodeFrames, setOpener, tlsOptions, guarded, tokenFile };
