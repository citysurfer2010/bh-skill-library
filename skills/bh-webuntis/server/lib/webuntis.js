/** Tagesplan aus WebUntis: Anmeldung wie auf der Webseite, danach nur lesende Abfragen. */
'use strict';

const UA = 'bh-platform/1.0';
const TZ = 'Europe/Berlin';
let http = (...a) => fetch(...a);
const setFetch = (f) => { http = f; };

const base = () => `https://${process.env.BH_WEBUNTIS_SERVER}/WebUntis`;

function jar() {
  const cookies = new Map();
  return {
    take(res) { for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); cookies.set(pair.slice(0, i), pair.slice(i + 1)); } },
    header() { return [...cookies].map(([k, v]) => `${k}=${v}`).join('; '); },
  };
}

async function session() {
  const school = process.env.BH_WEBUNTIS_SCHOOL; const c = jar();
  const call = async (path, opts = {}) => {
    const res = await http(base() + path, { redirect: 'manual', signal: AbortSignal.timeout(20000), ...opts, headers: { 'user-agent': UA, cookie: c.header(), ...opts.headers } });
    c.take(res);
    return res;
  };
  await call(`/?school=${encodeURIComponent(school)}`);
  const body = new URLSearchParams({ school, j_username: process.env.BH_WEBUNTIS_USER, j_password: process.env.BH_WEBUNTIS_PASSWORD, token: '' });
  const login = await call('/j_spring_security_check', { method: 'POST', body, headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' } });
  const state = login.ok ? (await login.json().catch(() => ({}))).state : null;
  if (state !== 'SUCCESS') throw new Error(`WebUntis-Anmeldung fehlgeschlagen (${login.status})`);
  const tokenRes = await call('/api/token/new');
  if (!tokenRes.ok) throw new Error(`WebUntis-Zugang verweigert (${tokenRes.status})`);
  const auth = { authorization: `Bearer ${await tokenRes.text()}`, accept: 'application/json' };
  return async (path) => {
    const r = await call(path, { headers: auth });
    if (!r.ok) throw new Error(`WebUntis antwortet nicht (${r.status})`);
    return r.json();
  };
}

const clock = (iso) => String(iso).slice(11, 16);
const pick = (entry, type) => [entry.position1, entry.position2, entry.position3, entry.position4].flat().filter(Boolean).find((p) => (p.current || p.removed)?.type === type);

function lesson(e) {
  const subject = pick(e, 'SUBJECT'); const room = pick(e, 'ROOM');
  const name = subject?.current || subject?.removed;
  const changed = ['CHANGED', 'SUBSTITUTION', 'ROOM_SUBSTITUTION', 'TEACHER_SUBSTITUTION', 'ADDITIONAL'].includes(e.status) || !!room?.removed;
  return {
    from: clock(e.duration.start), to: clock(e.duration.end),
    subject: name?.shortName || name?.displayName || e.name || '?', title: name?.longName || name?.displayName || '',
    state: e.status === 'CANCELLED' ? 'cancelled' : changed ? 'changed' : 'regular',
    exam: e.type === 'EXAM', room: room?.current?.shortName || '', note: e.substitutionText || '',
  };
}

function berlin(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday };
}

const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Ab 16 Uhr zählt der nächste Tag, am Wochenende der Montag. */
function schoolDate(now = new Date()) {
  const b = berlin(now);
  let d = b.hour >= 16 ? addDays(b.date, 1) : b.date;
  const day = new Date(`${d}T12:00:00Z`).getUTCDay();
  if (day === 6) d = addDays(d, 2); else if (day === 0) d = addDays(d, 1);
  return d;
}

function label(date, now = new Date()) {
  const today = berlin(now).date;
  if (date === today) return 'Heute';
  if (date === addDays(today, 1)) return 'Morgen';
  return ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][new Date(`${date}T12:00:00Z`).getUTCDay()];
}

async function day(date = schoolDate()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Datum als JJJJ-MM-TT');
  const get = await session();
  const data = await get('/api/rest/view/v1/app/data');
  const kids = [];
  for (const s of data.user?.students || []) {
    const q = new URLSearchParams({ start: date, end: date, format: '1', resourceType: 'STUDENT', resources: String(s.id), periodTypes: '', timetableType: 'MY_TIMETABLE' });
    const t = await get(`/api/rest/view/v1/timetable/entries?${q}`);
    const lessons = (t.days?.[0]?.gridEntries || []).map(lesson).sort((a, b) => a.from.localeCompare(b.from));
    kids.push({ name: String(s.displayName).split(' ').pop(), lessons });
  }
  return { date, label: label(date), kids };
}

module.exports = { day, schoolDate, label, lesson, setFetch };
