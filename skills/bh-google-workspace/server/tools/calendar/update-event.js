'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');
const { privateBody } = require('../../lib/calendar-json.js');

// attendees = complete guest list (replaces the old one) — the caller merges; sendUpdates default "none" (no mail for a text fix),
// "all" when guests were added or the time moved (25.10.2026, BT calendar of the WunderAgent cockpit).
module.exports = { name: 'calendar.updateEvent', description: 'Updates an existing calendar event. attendees = complete guest list (replaces the old one); sendUpdates all|externalOnly|none (default none).', inputSchema: { type: 'object', properties: { calendarId: { type: 'string' }, eventId: { type: 'string' }, summary: { type: 'string' }, startDateTime: { type: 'string' }, endDateTime: { type: 'string' }, description: { type: 'string' }, location: { type: 'string' }, attendees: { type: 'array', items: { type: 'string' } }, timeZone: { type: 'string' }, sendUpdates: { type: 'string', enum: ['all', 'externalOnly', 'none'] }, privateProperties: { type: 'object', description: 'extendedProperties.private (key → text, null deletes)' }, colorId: { type: 'string', description: 'Color ("8" = gray); empty = calendar color' } }, required: ['eventId'] },
  handler: async ({ calendarId = 'primary', eventId, summary, startDateTime, endDateTime, description, location, attendees, timeZone, sendUpdates = 'none', privateProperties, colorId }) => {
  const update = {};
  if (summary) update.summary = summary;
  if (startDateTime) update.start = { dateTime: startDateTime, ...(timeZone ? { timeZone } : {}) };
  if (endDateTime) update.end = { dateTime: endDateTime, ...(timeZone ? { timeZone } : {}) };
  if (description !== undefined) update.description = description;
  if (location !== undefined) update.location = location;
  if (Array.isArray(attendees)) update.attendees = attendees.map((e) => ({ email: e }));
  if (privateProperties) update.extendedProperties = privateBody(privateProperties);
  if (colorId !== undefined) update.colorId = colorId === '' ? null : String(colorId);
  const send = ['all', 'externalOnly', 'none'].includes(sendUpdates) ? sendUpdates : 'none';
  const r = await gapiJSON('PATCH', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=${send}`, update);
  if (r.status !== 200) return apiErr('calendar.updateEvent', r.status, r.data);
  return ok(`Termin aktualisiert: ${r.data.summary} [${r.data.id}]`);},
};
