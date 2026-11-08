'use strict';
const { apiErr, err, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'calendar.respondToEvent', description: 'Antwortet auf eine Kalender-Einladung.', inputSchema: { type: 'object', properties: { calendarId: { type: 'string' }, eventId: { type: 'string' }, response: { type: 'string', enum: ['accepted', 'declined', 'tentative'] } }, required: ['eventId', 'response'] },
  handler: async ({ calendarId = 'primary', eventId, response }) => {
  // response: 'accepted' | 'declined' | 'tentative'
  const me = await gapiJSON('GET', 'https://people.googleapis.com/v1/people/me?personFields=emailAddresses');
  const email = me.data?.emailAddresses?.[0]?.value;
  if (!email) return err('Eigene E-Mail-Adresse konnte nicht ermittelt werden.');
  const event = await gapiJSON('GET', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`);
  if (event.status !== 200) return apiErr('calendar.respondToEvent (get)', event.status, event.data);
  const attendees = (event.data.attendees || []).map(a =>
    a.email === email ? { ...a, responseStatus: response } : a
  );
  const r = await gapiJSON('PATCH', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, { attendees });
  if (r.status !== 200) return apiErr('calendar.respondToEvent', r.status, r.data);
  return ok(`Einladungsantwort "${response}" für Termin ${eventId} gespeichert.`);},
};
