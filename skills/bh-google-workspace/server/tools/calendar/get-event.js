'use strict';
const { apiErr, gapiJSON, ok, okJson } = require('../../lib/gapi.js');
const { eventJson } = require('../../lib/calendar-json.js');

module.exports = { name: 'calendar.getEvent', description: 'Gibt Details zu einem Kalender-Ereignis zurück. format "json" = strukturiert (Gäste, privateProperties, Link).', inputSchema: { type: 'object', properties: { calendarId: { type: 'string' }, eventId: { type: 'string' }, format: { type: 'string', enum: ['text', 'json'] } }, required: ['eventId'] },
  handler: async ({ calendarId = 'primary', eventId, format = 'text' }) => {
  const r = await gapiJSON('GET', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`);
  if (r.status !== 200) return apiErr('calendar.getEvent', r.status, r.data);
  const e = r.data;
  if (format === 'json') return okJson(eventJson(e));
  const attendees = (e.attendees || []).map(a => `  ${a.email} (${a.responseStatus})`).join('\n');
  return ok(`Titel: ${e.summary}\nStart: ${e.start?.dateTime || e.start?.date}\nEnde: ${e.end?.dateTime || e.end?.date}\nOrt: ${e.location || ''}\nBeschreibung: ${e.description || ''}\nTeilnehmer:\n${attendees}`);},
};
