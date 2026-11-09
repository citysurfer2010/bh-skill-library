'use strict';
const { ok } = require('../../lib/gapi.js');

module.exports = {
  name: 'time.getCurrentDate',
  description: 'Returns the current date.',
  inputSchema: {
    type: 'object',
    properties: {
      timeZone: { type: 'string', description: 'Time zone (default: Europe/Berlin)' },
    },
  },
  handler: async ({ timeZone }) => {
    const tz = timeZone || 'Europe/Berlin';
    const d = new Date().toLocaleDateString('de-DE', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return ok(d);
  },
};
