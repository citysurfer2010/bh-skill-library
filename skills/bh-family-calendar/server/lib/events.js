'use strict';
/** Einmalige Termine aus genau einem Kalender. Serientermine wie Geburtstage bleiben bewusst draußen. */
const WINDOW_DAYS = 14; const MAX = 6;

const berlin = (iso) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};

/** Rein, damit sie testbar bleibt. */
function select(items, now = new Date()) {
  const today = berlin(now).date;
  return (items || [])
    .filter((e) => e.status !== 'cancelled' && !e.recurringEventId && !e.recurrence)
    .map((e) => {
      const at = e.start?.dateTime ? berlin(e.start.dateTime) : { date: e.start?.date, time: null };
      const timed = e.start?.dateTime ? { startAt: Date.parse(e.start.dateTime), endAt: Date.parse(e.end?.dateTime || e.start.dateTime) } : {};
      return { date: at.date < today ? today : at.date, time: at.date < today ? null : at.time, title: String(e.summary || 'Termin').slice(0, 80), ...timed };
    })
    .filter((e) => e.date)
    .slice(0, MAX);
}

async function upcoming(now = new Date(), api = require('../../../bh-google-workspace/server/lib/gapi.js').gapiJSON) {
  const id = process.env.BH_FAMILY_CALENDAR_ID;
  if (!id) throw new Error('Family-Kalender ist nicht eingerichtet');
  const until = new Date(now.getTime() + WINDOW_DAYS * 864e5);
  const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '40', timeMin: now.toISOString(), timeMax: until.toISOString() });
  const r = await api('GET', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${q}`);
  if (r.status !== 200) throw new Error(`Google antwortet ${r.status}`);
  return select(r.data.items, now);
}
module.exports = { select, upcoming };
