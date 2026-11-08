/**
 * Anmeldung ohne Portweiterleitung: Der Browser landet nach der Zustimmung auf einer nicht
 * erreichbaren localhost-Seite, deren Adresse der User zurueckgibt. Der PKCE-Schluessel bleibt
 * auf dem Gateway, der Code allein nuetzt niemandem.
 */
'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { CREDS, CFG_DIR, CLIENT_SECRET } = require('./config.js');
const { writeAtomic, loadCreds } = require('./auth.js');

const REDIRECT = 'http://localhost:8765/';
const PENDING  = path.join(CFG_DIR, 'login-pending.json');
const G = 'https://www.googleapis.com/auth/';
const BASE = ['openid', 'email', 'profile'];
const FULL = ['gmail.modify', 'drive', 'calendar', 'documents', 'spreadsheets', 'presentations', 'tasks'];
const READ = ['gmail.readonly', 'drive.readonly', 'calendar.readonly', 'documents.readonly', 'spreadsheets.readonly', 'presentations.readonly', 'tasks.readonly'];
const CHAT = ['chat.messages', 'chat.spaces.readonly'];

function client() {
  if (!fs.existsSync(CLIENT_SECRET)) throw new Error('Google ist fuer diese Installation noch nicht eingerichtet (OAuth-Client fehlt).');
  const raw = JSON.parse(fs.readFileSync(CLIENT_SECRET, 'utf8'));
  const c = raw.installed || raw.web || raw;
  if (!c.client_id || !c.client_secret) throw new Error('OAuth-Client unvollstaendig.');
  return c;
}

const b64url = (buf) => buf.toString('base64url');

function startLogin({ readOnly = false, withChat = false } = {}) {
  const c = client();
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const scope = [...BASE, ...[...(readOnly ? READ : FULL), ...(withChat ? CHAT : [])].map((s) => G + s)].join(' ');
  fs.mkdirSync(CFG_DIR, { recursive: true, mode: 0o700 });
  writeAtomic(PENDING, JSON.stringify({ state, verifier, createdAt: Date.now() }));
  const params = new URLSearchParams({
    client_id: c.client_id, redirect_uri: REDIRECT, response_type: 'code', scope,
    access_type: 'offline', prompt: 'consent', state,
    code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function finishLogin(redirectUrl, fetchImpl = fetch) {
  let pending;
  try { pending = JSON.parse(fs.readFileSync(PENDING, 'utf8')); } catch { throw new Error('Keine Anmeldung offen: zuerst auth.loginStart.'); }
  if (Date.now() - pending.createdAt > 15 * 60_000) throw new Error('Anmeldung abgelaufen: bitte neu starten.');
  const url = new URL(redirectUrl);
  if (url.searchParams.get('state') !== pending.state) throw new Error('Die Adresse gehoert nicht zu dieser Anmeldung.');
  const code = url.searchParams.get('code');
  if (!code) throw new Error(`Google meldet: ${url.searchParams.get('error') || 'kein Code'}`);
  const c = client();
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: c.client_id, client_secret: c.client_secret, redirect_uri: REDIRECT, grant_type: 'authorization_code', code_verifier: pending.verifier }),
  });
  const t = await res.json();
  if (!res.ok || !t.refresh_token) throw new Error(`Token-Abruf fehlgeschlagen: ${t.error || res.status}`);
  writeAtomic(CREDS, JSON.stringify({
    auth_provider: 'self', client_id: c.client_id, client_secret: c.client_secret,
    access_token: t.access_token, refresh_token: t.refresh_token, expiry_date: Date.now() + t.expires_in * 1000,
  }, null, 2));
  fs.unlinkSync(PENDING);
  loadCreds();
}

module.exports = { startLogin, finishLogin };
