'use strict';
/** Liest die Netatmo-Heizung über den Web-Login des Familienkontos, nur lesend. Anmeldung selten, Fehlversuche gesperrt. */
const fs = require('fs');
const path = require('path');

let doFetch = (...a) => fetch(...a);
const setFetch = (f) => { doFetch = f; };
const AUTH = 'https://auth.netatmo.com'; const API = 'https://app.netatmo.net';
const NEXT = encodeURIComponent('https://home.netatmo.com/control/dashboard');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const TOKEN_MS = 150 * 60_000; const LOCK_MS = 30 * 60_000; const ROOMS_MS = 5 * 60_000;

const file = () => path.join(process.env.BH_FAMILY_DIR || '/tmp/bh-family', 'netatmo.json');
function read() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; } }
function write(patch) { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify({ ...read(), ...patch }), { mode: 0o600 }); }

function jar() {
  const c = {};
  return {
    eat(res) { for (const l of res.headers.getSetCookie?.() || []) { const p = l.split(';')[0]; const i = p.indexOf('='); c[p.slice(0, i)] = p.slice(i + 1); } },
    head: () => Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '),
    get: (k) => c[k],
  };
}
async function go(j, url, init = {}) {
  let u = url; let opts = init;
  for (let hop = 0; hop < 6; hop++) {
    const res = await doFetch(u, { redirect: 'manual', signal: AbortSignal.timeout(20_000), ...opts, headers: { 'user-agent': UA, cookie: j.head(), ...opts.headers } });
    j.eat(res);
    const loc = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !loc) return res;
    u = new URL(loc, u).href; opts = {};
  }
  throw new Error('Netatmo leitet zu oft um');
}
async function login() {
  const s = read();
  if (s.lockedUntil > Date.now()) throw new Error('Netatmo-Anmeldung kurz gesperrt, weil der letzte Versuch scheiterte');
  const j = jar(); const page = `${AUTH}/en-us/access/login?next_url=${NEXT}`;
  await go(j, page);
  const csrf = await go(j, `${AUTH}/access/csrf`, { headers: { referer: page } });
  const { token: formToken } = await csrf.json();
  const body = new URLSearchParams({ _token: formToken, email: process.env.BH_NETATMO_USER || '', password: process.env.BH_NETATMO_PASSWORD || '', stay_logged: 'on' });
  await go(j, `${AUTH}/access/postlogin?next_url=${NEXT}`, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', referer: page, origin: AUTH } });
  const token = decodeURIComponent(j.get('netatmocomaccess_token') || '');
  if (!token) { write({ lockedUntil: Date.now() + LOCK_MS }); throw new Error('Netatmo lehnt die Anmeldung ab'); }
  write({ token, tokenUntil: Date.now() + TOKEN_MS, lockedUntil: 0 });
  return token;
}
const currentToken = async () => { const s = read(); return s.token && s.tokenUntil > Date.now() ? s.token : login(); };

async function api(p, payload) {
  for (let retry = 0; ; retry++) {
    const res = await doFetch(API + p, { method: 'POST', headers: { 'user-agent': UA, authorization: `Bearer ${await currentToken()}`, 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000) });
    if ((res.status === 401 || res.status === 403) && !retry) { write({ token: '' }); continue; }
    if (!res.ok) throw new Error(`Netatmo antwortet ${res.status}`);
    return (await res.json()).body;
  }
}
const LOW = ['low', 'very_low'];
function combine(home, status) {
  const live = Object.fromEntries((status.rooms || []).map((r) => [r.id, r]));
  const mods = Object.fromEntries((status.modules || []).map((m) => [m.id, m]));
  return (home.rooms || []).filter((r) => live[r.id]).map((r) => {
    const l = live[r.id];
    return { name: r.name, temp: l.therm_measured_temperature, target: l.therm_setpoint_temperature, mode: l.therm_setpoint_mode, heating: (l.heating_power_request || 0) > 0, windowOpen: !!l.open_window, reachable: !!l.reachable, batteryLow: (r.module_ids || []).some((id) => LOW.includes(mods[id]?.battery_state)) };
  });
}
async function rooms() {
  const c = read().rooms;
  if (c && Date.now() - c.at < ROOMS_MS) return c.data;
  const { homes } = await api('/api/homesdata', {});
  const home = homes.find((h) => h.rooms?.length);
  if (!home) throw new Error('Kein Zuhause mit Räumen gefunden');
  const { home: status } = await api('/syncapi/v1/homestatus', { home_id: home.id });
  const data = combine(home, status);
  write({ rooms: { at: Date.now(), data } });
  return data;
}
module.exports = { rooms, combine, setFetch };
