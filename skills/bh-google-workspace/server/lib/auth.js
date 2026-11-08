/**
 * OAuth-Credentials + Access-Token Management.
 *
 * Token-State ist Modul-privat (`_creds`). `getAccessToken()` refresht
 * automatisch wenn die Restlaufzeit unter 10 Min fällt, mit Single-Flight-
 * Schutz (`_refreshing`) damit parallele Tool-Aufrufe nicht mehrfach
 * refreshen.
 *
 * Refresh direkt gegen oauth2.googleapis.com mit dem eigenen OAuth-Client der Firma.
 * credentials.json entsteht ueber auth.loginStart und auth.loginFinish.
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const { CREDS } = require('./config.js');

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

let _creds      = null;
let _refreshing = false;

// Last-known-good copy: written after every successful save, read when the main
// file is missing, empty or not JSON. WHY (16.10.2026): a non-atomic write during a
// full disk left credentials.json at 0 bytes; the refresh_token existed nowhere else
// and Drive/Calendar/Gmail were down until a manual re-auth.
const LKG = `${CREDS}.lkg`;

function readCredsFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && parsed.access_token ? parsed : null;
  } catch { return null; }
}

function loadCreds() {
  const main = readCredsFile(CREDS);
  const fallback = main ? null : readCredsFile(LKG);
  if (!main && !fallback) throw new Error('credentials.json fehlt oder ist leer (auch keine .lkg-Kopie). Bitte Google Auth erneuern.');
  if (fallback) process.stderr.write('[bh-google-workspace] credentials.json unreadable — using last-known-good copy\n');
  _creds = main || fallback;
}

/**
 * Owner the replacement must keep: the existing file's, else its directory's.
 * WHY (29.10.2026): a test suite started via `docker exec` without `-u node` ran as root,
 * refreshed the token and renamed a root:root 0600 temp file over credentials.json and
 * the .lkg copy — every Google tool running as `node` then failed with "fehlt oder ist leer".
 */
function targetOwner(file, fsx) {
  for (const p of [file, path.dirname(file)]) {
    try { const s = fsx.statSync(p); return { uid: s.uid, gid: s.gid }; } catch { /* try next */ }
  }
  return null;
}

/**
 * Atomic write: temp file + fsync + rename, so a crash or full disk never leaves a truncated file.
 * The temp file gets the target's owner before the rename, so a write by root never changes it.
 * EPERM (not root, foreign owner) is ignored: then the writer's own uid is the only option anyway.
 * `fsx` is injectable for tests.
 */
function writeAtomic(file, content, fsx = fs) {
  const tmp = `${file}.${process.pid}.tmp`;
  const owner = targetOwner(file, fsx);
  const fd = fsx.openSync(tmp, 'w', 0o600);
  try {
    fsx.writeSync(fd, content);
    fsx.fsyncSync(fd);
    if (owner) {
      try { fsx.fchownSync(fd, owner.uid, owner.gid); } catch (e) { if (e.code !== 'EPERM') throw e; }
    }
    fsx.closeSync(fd);
  } catch (e) {
    try { fsx.closeSync(fd); } catch { /* already closed */ }
    try { fsx.unlinkSync(tmp); } catch { /* nothing to clean up */ }
    throw e;
  }
  fsx.renameSync(tmp, file);
}

function saveCreds() {
  if (!_creds || !_creds.access_token || !_creds.refresh_token) {
    throw new Error('saveCreds refused: credentials without access_token/refresh_token would destroy the login');
  }
  const content = JSON.stringify(_creds, null, 2);
  writeAtomic(CREDS, content);
  try { writeAtomic(LKG, content); } catch (e) {
    process.stderr.write(`[bh-google-workspace] last-known-good copy not written: ${e.message}\n`);
  }
}

function rawHttps(method, hostname, urlPath, body, headers) {
  return new Promise((resolve, reject) => {
    const isFormBody = headers && headers['Content-Type'] === 'application/x-www-form-urlencoded';
    const bodyStr = body
      ? (isFormBody ? body : JSON.stringify(body))
      : null;
    const reqHeaders = {
      'Content-Type': isFormBody ? 'application/x-www-form-urlencoded' : 'application/json',
      ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      ...headers,
    };
    const req = https.request({ hostname, path: urlPath, method, headers: reqHeaders }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function refreshViaSelf(rt, clientId, clientSecret) {
  if (!clientId || !clientSecret) throw new Error('credentials.json braucht client_id + client_secret in credentials.json');
  const form = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: rt,
    client_id:     clientId,
    client_secret: clientSecret,
  }).toString();
  const u   = new URL(GOOGLE_TOKEN_ENDPOINT);
  const res = await rawHttps('POST', u.hostname, u.pathname, form, { 'Content-Type': 'application/x-www-form-urlencoded' });
  if (res.status !== 200) throw new Error(`Token-Refresh (self) HTTP ${res.status}: ${res.body.substring(0, 200)}`);
  const data = JSON.parse(res.body);
  if (!data.access_token) throw new Error('Kein access_token in Refresh-Antwort (self)');
  return {
    access_token:  data.access_token,
    expiry_date:   Date.now() + ((data.expires_in || 3600) * 1000),
    refresh_token: data.refresh_token,  // Google rotiert refresh_token in der Regel nicht
  };
}

async function refreshAccessToken() {
  if (!_creds) loadCreds();
  const rt = _creds.refresh_token;
  if (!rt) throw new Error('Kein refresh_token — Full re-auth erforderlich.');
  const result = await refreshViaSelf(rt, _creds.client_id, _creds.client_secret);
  _creds.access_token = result.access_token;
  _creds.expiry_date  = result.expiry_date;
  if (result.refresh_token) _creds.refresh_token = result.refresh_token;
  saveCreds();
  process.stderr.write(`[bh-google-workspace] Token refreshed OK\n`);
}

async function getAccessToken() {
  if (!_creds) loadCreds();
  const exp = _creds.expiry_date || 0;
  if (exp - Date.now() > 10 * 60 * 1000) return _creds.access_token;
  if (!_refreshing) {
    _refreshing = true;
    try { await refreshAccessToken(); } finally { _refreshing = false; }
  }
  return _creds.access_token;
}

/** Löscht credentials.json (+ .lkg-Kopie) + setzt In-Memory-Cache zurück (für auth.clear-Tool). */
function clearCreds() {
  if (fs.existsSync(CREDS)) fs.unlinkSync(CREDS);
  if (fs.existsSync(LKG)) fs.unlinkSync(LKG);
  _creds      = null;
  _refreshing = false;
}

module.exports = { LKG, loadCreds, saveCreds, writeAtomic, rawHttps, refreshAccessToken, getAccessToken, clearCreds };
