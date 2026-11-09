/** Daily schedule from WebUntis: login as on the website, then only read queries. */
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

/** From 4 pm the next day counts, at the weekend the Monday. */
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

const compact = (d) => d.replace(/-/g, '');
const fromCompact = (n) => String(n).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');

/** Open homework per child and due date. */
function homeworkIndex(data) {
  const lessons = new Map((data.lessons || []).map((l) => [l.id, l.subject]));
  const owners = new Map((data.records || []).map((r) => [r.homeworkId, r.elementIds || []]));
  const out = new Map();
  for (const h of data.homeworks || []) {
    if (h.completed) continue;
    for (const student of owners.get(h.id) || []) {
      const key = `${student}:${fromCompact(h.dueDate)}`;
      if (!out.has(key)) out.set(key, []);
      out.get(key).push({ subject: lessons.get(h.lessonId) || '', text: String(h.text || '').slice(0, 140) });
    }
  }
  return out;
}

function nextSchoolDates(count, start = schoolDate()) {
  const dates = []; let d = start;
  while (dates.length < count) { const wd = new Date(`${d}T12:00:00Z`).getUTCDay(); if (wd !== 0 && wd !== 6) dates.push(d); d = addDays(d, 1); }
  return dates;
}

/** Several school days in one login, for paging. */
async function days(count = 5) {
  const dates = nextSchoolDates(Math.min(Math.max(Number(count) || 5, 1), 10));
  const get = await session();
  const data = await get('/api/rest/view/v1/app/data');
  const first = dates[0]; const last = dates[dates.length - 1];
  const hw = await get(`/api/homeworks/lessons?startDate=${compact(first)}&endDate=${compact(last)}`);
  const homework = homeworkIndex(hw.data || {});
  const plans = [];
  for (const s of data.user?.students || []) {
    const q = new URLSearchParams({ start: first, end: last, format: '1', resourceType: 'STUDENT', resources: String(s.id), periodTypes: '', timetableType: 'MY_TIMETABLE' });
    const t = await get(`/api/rest/view/v1/timetable/entries?${q}`);
    const byDate = new Map((t.days || []).map((d) => [d.date, (d.gridEntries || []).map(lesson).sort((a, b) => a.from.localeCompare(b.from))]));
    plans.push({ id: s.id, name: String(s.displayName).split(' ').pop(), byDate });
  }
  return { days: dates.map((date) => ({ date, kids: plans.map((p) => ({ name: p.name, lessons: p.byDate.get(date) || [], homework: homework.get(`${p.id}:${date}`) || [] })) })) };
}

module.exports = { day, days, homeworkIndex, nextSchoolDates, schoolDate, label, lesson, setFetch };
