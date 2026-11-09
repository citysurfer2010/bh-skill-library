/** Access to the Synology through its web API, per user with their own account. */
'use strict';

const fs    = require('fs');
const https = require('https');
const os    = require('os');
const path  = require('path');

const RELOGIN = new Set([105, 106, 107, 119]);
const MESSAGES = { 400: 'Ungueltiger Pfad', 402: 'Keine Berechtigung', 407: 'Keine Berechtigung', 408: 'Datei oder Ordner nicht gefunden', 105: 'Keine Berechtigung' };
const JSON_LIMIT = 8 * 1024 * 1024;

const credsFile = () => path.join(process.env.HOME || os.homedir(), '.config', 'bh-nas', '.env');

function credentials() {
  let text;
  try { text = fs.readFileSync(credsFile(), 'utf8'); } catch { throw new Error('Synology noch nicht verbunden: im eigenen Terminal bh-nas-connect ausfuehren (Skill bh-nas).'); }
  const get = (k) => (text.split('\n').find((l) => l.startsWith(`${k}=`)) || '').slice(k.length + 1);
  return { user: get('BH_NAS_USER'), password: get('BH_NAS_PASSWORD') };
}

// The Synology has its own certificate: it is pinned and compared exactly.
function tlsOptions() {
  const fingerprint = process.env.BH_NAS_FP;
  return {
    ca: Buffer.from(process.env.BH_NAS_CA_B64 || '', 'base64').toString('utf8'),
    checkServerIdentity: (_host, cert) => (cert.fingerprint256 === fingerprint ? undefined : new Error('Zertifikat der Synology stimmt nicht')),
  };
}

function realPost(params, { limit = JSON_LIMIT } = {}) {
  const url = new URL('/webapi/entry.cgi', process.env.BH_NAS_URL);
  const body = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(url, { ...tlsOptions(), method: 'POST', timeout: 45_000, headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(body) } }, (res) => {
      const parts = []; let size = 0; let truncated = false;
      res.on('data', (c) => {
        size += c.length; parts.push(c);
        if (size > limit) { truncated = true; res.destroy(); resolve({ type: res.headers['content-type'] || '', body: Buffer.concat(parts), truncated }); }
      });
      res.on('end', () => { if (!truncated) resolve({ type: res.headers['content-type'] || '', body: Buffer.concat(parts), truncated }); });
      res.on('error', (e) => { if (!truncated) reject(e); });
    });
    req.on('timeout', () => req.destroy(new Error('Synology antwortet nicht')));
    req.on('error', reject);
    req.end(body);
  });
}

let transport = realPost;
let sid = null;
const setTransport = (t) => { transport = t; sid = null; };

function fail(code) { return Object.assign(new Error(MESSAGES[code] || `Synology-Fehler ${code}`), { code }); }
const parse = (r) => JSON.parse(r.body.toString('utf8'));

async function login() {
  const { user, password } = credentials();
  const r = parse(await transport({ api: 'SYNO.API.Auth', version: '6', method: 'login', account: user, passwd: password, session: 'FileStation', format: 'sid' }));
  if (!r.success) throw new Error('Anmeldung an der Synology fehlgeschlagen: bitte bh-nas-connect erneut ausfuehren.');
  sid = r.data.sid;
}

/** Runs a call and logs in again once if the session has expired. */
async function request(params, options) {
  if (!sid) await login();
  let res = await transport({ ...params, _sid: sid }, options);
  if (res.type.includes('json')) {
    const code = parse(res).error?.code;
    if (RELOGIN.has(code)) { await login(); res = await transport({ ...params, _sid: sid }, options); }
  }
  return res;
}

async function call(api, version, method, params = {}) {
  const r = parse(await request({ api, version: String(version), method, ...params }));
  if (!r.success) throw fail(r.error?.code);
  return r.data;
}

/** Reads at most maxBytes of a file. */
async function download(file, maxBytes) {
  const res = await request({ api: 'SYNO.FileStation.Download', version: '2', method: 'download', path: JSON.stringify([file]), mode: 'download' }, { limit: maxBytes });
  if (res.type.includes('application/json')) { const r = parse(res); if (r.success === false) throw fail(r.error?.code); }
  return res;
}

function checkPath(p) {
  if (typeof p !== 'string' || !p.startsWith('/') || p.split('/').includes('..') || /[\0\r\n]/.test(p)) throw new Error('Pfad muss absolut sein, zum Beispiel /Backup/ordner');
  return p;
}

const ok = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const TLS_CODES = new Set(['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY']);
const failed = (e) => ({ content: [{ type: 'text', text: TLS_CODES.has(e.code) ? 'Das Zertifikat der Synology ist noch nicht eingerichtet (siehe LIMITATIONS.md im Skill bh-nas).' : e.message }], isError: true });
const guarded = (fn) => async (args) => { try { return ok(await fn(args || {})); } catch (e) { return failed(e); } };

module.exports = { call, download, checkPath, guarded, setTransport, tlsOptions };
