'use strict';
const { apiErr, gapiJSON, ok, okJson } = require('../../lib/gapi.js');
const { eventJson } = require('../../lib/calendar-json.js');

module.exports = { name: 'calendar.listEvents', description: 'Lists calendar events.', inputSchema: { type: 'object', properties: { calendarId: { type: 'string', description: 'Calendar ID (default: primary)' }, timeMin: { type: 'string', description: 'ISO 8601 Start' }, timeMax: { type: 'string', description: 'ISO 8601 end' }, maxResults: { type: 'number' }, query: { type: 'string' }, privateExtendedProperty: { type: 'array', items: { type: 'string' }, description: 'Filter "key=value" on extendedProperties.private' }, format: { type: 'string', enum: ['text', 'json'] } } },
  handler: async ({ calendarId = 'primary', timeMin, timeMax, maxResults = 20, query, privateExtendedProperty = [], format = 'text' }) => {
  let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=${maxResults}&orderBy=startTime&singleEvents=true`;
  if (timeMin) url += `&timeMin=${encodeURIComponent(timeMin)}`;
  if (timeMax) url += `&timeMax=${encodeURIComponent(timeMax)}`;
  if (query) url += `&q=${encodeURIComponent(query)}`;
  for (const p of privateExtendedProperty || []) url += `&privateExtendedProperty=${encodeURIComponent(p)}`;
  const r = await gapiJSON('GET', url);
  if (r.status !== 200) return apiErr('calendar.listEvents', r.status, r.data);
  const events = r.data.items || [];
  if (format === 'json') return okJson({ events: events.map(eventJson), next_page_token: r.data.nextPageToken || null });
  if (!events.length) return ok('Keine Termine gefunden.');
  const lines = events.map(e => {
    const start = e.start?.dateTime || e.start?.date || '?';
    const end   = e.end?.dateTime   || e.end?.date   || '?';
    return `${start} – ${end}: ${e.summary || '(kein Titel)'} [${e.id}]`;
  }).join('\n');
  return ok(`${events.length} Termin(e):\n\n${lines}`);},
};
