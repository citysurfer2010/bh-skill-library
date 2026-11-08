'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'calendar.deleteEvent', description: 'Löscht einen Kalendertermin.', inputSchema: { type: 'object', properties: { calendarId: { type: 'string' }, eventId: { type: 'string' } }, required: ['eventId'] },
  handler: async ({ calendarId = 'primary', eventId }) => {
  const r = await gapiJSON('DELETE', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`);
  if (r.status !== 204 && r.status !== 200) return apiErr('calendar.deleteEvent', r.status, r.data);
  return ok(`Termin ${eventId} gelöscht.`);},
};
