'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');
const { privateBody } = require('../../lib/calendar-json.js');

module.exports = { name: 'calendar.createEvent', description: 'Erstellt einen neuen Kalendertermin. attendees = Gäste (E-Mails); sendUpdates all|externalOnly|none — mit Gästen Standard "all", damit die Einladung per E-Mail ankommt.', inputSchema: { type: 'object', properties: { startDate: { type: 'string', description: 'Ganztägig: erster Tag als JJJJ-MM-TT, statt startDateTime' }, endDate: { type: 'string', description: 'Ganztägig: Tag nach dem letzten Tag als JJJJ-MM-TT' }, recurrence: { type: 'array', items: { type: 'string' }, description: 'Wiederholung, z. B. RRULE:FREQ=YEARLY' }, transparency: { type: 'string', description: 'transparent = blockiert keine Zeit' }, calendarId: { type: 'string' }, summary: { type: 'string' }, startDateTime: { type: 'string' }, endDateTime: { type: 'string' }, description: { type: 'string' }, location: { type: 'string' }, attendees: { type: 'array', items: { type: 'string' } }, timeZone: { type: 'string' }, sendUpdates: { type: 'string', enum: ['all', 'externalOnly', 'none'] }, privateProperties: { type: 'object', description: 'extendedProperties.private (Schluessel → Text)' }, colorId: { type: 'string' } }, required: ['summary'] },
  handler: async ({ calendarId = 'primary', summary, startDateTime, endDateTime, startDate, endDate, recurrence, transparency, description, location, attendees = [], timeZone, sendUpdates, privateProperties, colorId }) => {
  const when = startDate ? { start: { date: startDate }, end: { date: endDate || startDate } } : { start: { dateTime: startDateTime, timeZone: timeZone || 'Europe/Berlin' }, end: { dateTime: endDateTime, timeZone: timeZone || 'Europe/Berlin' } };
  const event = { summary, ...when };
  if (recurrence && recurrence.length) event.recurrence = recurrence;
  if (transparency) event.transparency = transparency;
  if (description) event.description = description;
  if (location) event.location = location;
  if (attendees.length) event.attendees = attendees.map(e => ({ email: e }));
  if (privateProperties) event.extendedProperties = privateBody(privateProperties);
  if (colorId) event.colorId = String(colorId);
  const send = sendUpdates || (attendees.length ? 'all' : 'none');
  const r = await gapiJSON('POST', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${send}`, event);
  if (r.status !== 200 && r.status !== 201) return apiErr('calendar.createEvent', r.status, r.data);
  return ok(`Termin erstellt: ${r.data.summary}\nID: ${r.data.id}\nLink: ${r.data.htmlLink}`);},
};
