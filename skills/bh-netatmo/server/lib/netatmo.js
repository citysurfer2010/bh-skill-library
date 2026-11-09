'use strict';
/** Liest die Netatmo-Heizung über den Web-Login des Familienkontos, nur lesend. Anmeldung selten, Fehlversuche gesperrt. */
const fs = require('fs');
const path = require('path');

let doFetch = (...a) => fetch(...a);
const setFetch = (f) => { doFetch = f; };
const AUTH = 'https://auth.netatmo.com'; const API = 'https://app.netatmo.net';
const NEXT = encodeURIComponent('https://home.netatmo.com/control/dashboard');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const ACCESS = 'netatmocomaccess_token';
const TOKEN_MS = 150 * 60_000; const LOCK_MS = 30 * 60_000; const ROOMS_MS = 5 * 60_000;

const file = () => path.join(process.env.BH_FAMILY_DIR || '/tmp/bh-family', 'netatmo.json');
function read() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; } }
function write(patch) { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify({ ...read(), ...patch }), { mode: 0o600 }); }

function jar(initial = {}) {
  const c = { ...initial };
  return {
    eat(res) { for (const l of res.headers.getSetCookie?.() || []) { const p = l.split(';')[0]; const i = p.indexOf('='); c[p.slice(0, i)] = p.slice(i + 1); } },
    head: () => Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '),
    get: (k) => c[k],
    drop: (k) => { delete c[k]; },
    dump: () => ({ ...c }),
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
  const token = decodeURIComponent(j.get(ACCESS) || '');
  if (!token) { write({ lockedUntil: Date.now() + LOCK_MS }); throw new Error('Netatmo lehnt die Anmeldung ab'); }
  write({ token, tokenUntil: Date.now() + TOKEN_MS, lockedUntil: 0, cookies: j.dump(), logins: (s.logins || 0) + 1 });
  return token;
}
/** Führt die bestehende Sitzung weiter. Neu anmelden muss sich der Skill nur, wenn das nicht mehr geht. */
async function resume() {
  const s = read();
  if (!s.cookies) return null;
  try {
    const j = jar(s.cookies); j.drop(ACCESS);
    await go(j, `${AUTH}/en-us/access/login?next_url=${NEXT}`);
    const token = decodeURIComponent(j.get(ACCESS) || '');
    if (!token) return null;
    write({ token, tokenUntil: Date.now() + TOKEN_MS, cookies: j.dump(), resumes: (s.resumes || 0) + 1 });
    return token;
  } catch { return null; }
}
const currentToken = async () => { const s = read(); return s.token && s.tokenUntil > Date.now() ? s.token : (await resume()) || login(); };

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
    return { id: String(r.id), name: r.name, temp: l.therm_measured_temperature, target: l.therm_setpoint_temperature, mode: l.therm_setpoint_mode, heating: (l.heating_power_request || 0) > 0, windowOpen: !!l.open_window, reachable: !!l.reachable, batteryLow: (r.module_ids || []).some((id) => LOW.includes(mods[id]?.battery_state)) };
  });
}
const MODE = { away: 'Abwesend', hg: 'Frostschutz' };
function planOf(home, status) {
  const list = home.therm_schedules || home.schedules || [];
  const active = list.find((x) => x.selected);
  const modes = (status.rooms || []).map((r) => r.therm_setpoint_mode);
  const special = MODE[home.therm_mode] ? home.therm_mode : modes.find((m) => MODE[m]);
  return { plan: active?.name || null, plans: list.map((x) => x.name), mode: special ? MODE[special] : null };
}
async function homeData() {
  const { homes } = await api('/api/homesdata', {});
  const home = homes.find((h) => h.rooms?.length);
  if (!home) throw new Error('Kein Zuhause mit Räumen gefunden');
  return home;
}
async function status() {
  const c = read().state;
  if (c && Date.now() - c.at < ROOMS_MS) return c.data;
  const home = await homeData();
  const { home: live } = await api('/syncapi/v1/homestatus', { home_id: home.id });
  const data = { rooms: combine(home, live), ...planOf(home, live) };
  write({ state: { at: Date.now(), data } });
  return data;
}
const rooms = async () => (await status()).rooms;

const MIN_TEMP = 7; const MAX_TEMP = 30; const DEFAULT_MINUTES = 180;
/** Setzt die Solltemperatur eines Raums für begrenzte Zeit oder gibt ihn an den Heizplan zurück. */
async function setRoom({ room, temp, minutes, backToPlan }, now = Date.now()) {
  const home = await homeData();
  const target = (home.rooms || []).find((r) => r.name === room || String(r.id) === String(room));
  if (!target) throw new Error(`Raum nicht gefunden: ${room}`);
  const change = { home_id: home.id, room_id: target.id, mode: 'home' };
  if (!backToPlan) {
    const t = Number(temp);
    if (!Number.isFinite(t) || t < MIN_TEMP || t > MAX_TEMP || (t * 2) % 1 !== 0) throw new Error(`Solltemperatur von ${MIN_TEMP} bis ${MAX_TEMP} Grad in halben Schritten angeben`);
    const span = Number(minutes) || home.therm_setpoint_default_duration || DEFAULT_MINUTES;
    Object.assign(change, { mode: 'manual', temp: t, endtime: Math.floor(now / 1000) + span * 60 });
  }
  await api('/api/setroomthermpoint', change);
  write({ state: null });
  return { room: target.name, ...(backToPlan ? { backToPlan: true } : { temp: change.temp, until: change.endtime }) };
}
module.exports = { rooms, status, setRoom, combine, setFetch };
