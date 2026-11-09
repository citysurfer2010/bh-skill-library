'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'calendar.list', description: 'Lists all Google calendars.', inputSchema: { type: 'object', properties: {} },
  handler: async () => {
  const r = await gapiJSON('GET', 'https://www.googleapis.com/calendar/v3/users/me/calendarList');
  if (r.status !== 200) return apiErr('calendar.list', r.status, r.data);
  const cals = (r.data.items || []).map(c => `${c.summary} (${c.id})`).join('\n');
  return ok(cals || 'Keine Kalender.');},
};
