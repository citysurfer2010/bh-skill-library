'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'calendar.findFreeTime', description: 'Sucht freie Zeiten für mehrere Personen.', inputSchema: { type: 'object', properties: { emails: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }, timeMin: { type: 'string' }, timeMax: { type: 'string' }, timeZone: { type: 'string' } }, required: ['emails', 'timeMin', 'timeMax'] },
  handler: async ({ emails, timeMin, timeMax, timeZone = 'Europe/Berlin' }) => {
  const items = (Array.isArray(emails) ? emails : [emails]).map(id => ({ id }));
  const r = await gapiJSON('POST', 'https://www.googleapis.com/calendar/v3/freeBusy', { timeMin, timeMax, timeZone, items });
  if (r.status !== 200) return apiErr('calendar.findFreeTime', r.status, r.data);
  const lines = [];
  for (const [cal, info] of Object.entries(r.data.calendars || {})) {
    const busy = (info.busy || []).map(b => `  ${b.start} – ${b.end}`).join('\n');
    lines.push(`${cal}:\n${busy || '  (frei)'}`);
  }
  return ok(lines.join('\n\n') || 'Keine Daten.');},
};
