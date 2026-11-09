'use strict';
/** One-off appointments from the owner's work calendar. Only the screen of that owner shows them. */
const WINDOW_DAYS = 7; const MAX = 5;

const berlin = (iso) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};

/** Keeps meetings that really block time: no series, blockers, free slots or declined invitations. */
function select(items, now = new Date()) {
  const today = berlin(now).date;
  return (items || [])
    .filter((e) => e.status !== 'cancelled' && !e.recurringEventId && !e.recurrence && e.transparency !== 'transparent')
    .filter((e) => !e.eventType || e.eventType === 'default')
    .filter((e) => (e.attendees || []).find((a) => a.self)?.responseStatus !== 'declined')
    .map((e) => {
      const at = e.start?.dateTime ? berlin(e.start.dateTime) : { date: e.start?.date, time: null };
      const hidden = e.visibility === 'private' || e.visibility === 'confidential' || !e.summary;
      const timed = e.start?.dateTime ? { startAt: Date.parse(e.start.dateTime), endAt: Date.parse(e.end?.dateTime || e.start.dateTime) } : {};
      return { date: at.date < today ? today : at.date, time: at.date < today ? null : at.time, title: hidden ? 'Privater Termin' : String(e.summary).slice(0, 80), ...timed };
    })
    .filter((e) => e.date)
    .slice(0, MAX);
}

async function upcoming(now = new Date(), api = require('../../../bh-google-workspace/server/lib/gapi.js').gapiJSON) {
  const id = process.env.BH_WORK_CALENDAR_ID; const owner = process.env.BH_WORK_CALENDAR_OWNER;
  if (!id || !owner) throw new Error('Work calendar is not configured');
  const until = new Date(now.getTime() + WINDOW_DAYS * 864e5);
  const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '60', timeMin: now.toISOString(), timeMax: until.toISOString() });
  const r = await api('GET', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${q}`);
  if (r.status !== 200) throw new Error(`Google responded ${r.status}`);
  return { owner: owner.toLowerCase(), events: select(r.data.items, now) };
}
module.exports = { select, upcoming };
