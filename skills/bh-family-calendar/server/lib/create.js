'use strict';
/** Baut und legt einmalige Termine im Family-Kalender an. Gäste bekommen die Einladung per E-Mail von Google. */
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; const MAX_GUESTS = 30;
const DAY = /^\d{4}-\d{2}-\d{2}$/; const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TZ = 'Europe/Berlin';

const plusOneDay = (d) => new Date(Date.parse(`${d}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
const plusHour = (s) => new Date(Date.parse(`${s}:00Z`) + 36e5).toISOString().slice(0, 16);

function when({ date, endDate, start, end }) {
  if (date) {
    if (start || end) throw new Error('Entweder date oder start angeben');
    if (!DAY.test(date) || (endDate && (!DAY.test(endDate) || endDate < date))) throw new Error('Datum als JJJJ-MM-TT angeben, Ende nicht vor Beginn');
    return { start: { date }, end: { date: plusOneDay(endDate || date) } };
  }
  if (!STAMP.test(String(start))) throw new Error('date oder start (JJJJ-MM-TTThh:mm) nötig');
  const stop = end || plusHour(start);
  if (!STAMP.test(stop) || stop <= start) throw new Error('Ende als JJJJ-MM-TTThh:mm angeben, nach dem Beginn');
  return { start: { dateTime: `${start}:00`, timeZone: TZ }, end: { dateTime: `${stop}:00`, timeZone: TZ } };
}

function guests(list = []) {
  const unique = [...new Set(list.map((g) => String(g).trim().toLowerCase()).filter(Boolean))];
  const bad = unique.filter((g) => !MAIL.test(g));
  if (bad.length) throw new Error(`Keine gültige E-Mail-Adresse: ${bad.join(', ')}`);
  if (unique.length > MAX_GUESTS) throw new Error(`Höchstens ${MAX_GUESTS} Gäste`);
  return unique;
}

function buildEvent(args) {
  const summary = String(args.summary || '').trim();
  if (!summary) throw new Error('Titel fehlt');
  const event = { summary: summary.slice(0, 200), ...when(args) };
  if (args.location) event.location = String(args.location);
  if (args.description) event.description = String(args.description);
  const invited = guests(args.attendees);
  if (invited.length) event.attendees = invited.map((email) => ({ email }));
  return event;
}

async function createEvent(args, api = require('../../../bh-google-workspace/server/lib/gapi.js').gapiJSON) {
  const event = buildEvent(args);
  const invited = (event.attendees || []).map((a) => a.email);
  if (args.dryRun) return { dryRun: true, event, invited };
  const id = process.env.BH_FAMILY_CALENDAR_ID;
  if (!id) throw new Error('Family-Kalender ist nicht eingerichtet');
  const r = await api('POST', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?sendUpdates=${invited.length ? 'all' : 'none'}`, event);
  if (r.status !== 200 && r.status !== 201) throw new Error(`Google antwortet ${r.status}`);
  return { id: r.data.id, link: r.data.htmlLink, summary: r.data.summary, invited };
}
module.exports = { buildEvent, createEvent };
