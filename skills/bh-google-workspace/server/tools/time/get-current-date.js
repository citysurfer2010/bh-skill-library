'use strict';
const { ok } = require('../../lib/gapi.js');

module.exports = {
  name: 'time.getCurrentDate',
  description: 'Gibt das aktuelle Datum zurück.',
  inputSchema: {
    type: 'object',
    properties: {
      timeZone: { type: 'string', description: 'Zeitzone (default: Europe/Berlin)' },
    },
  },
  handler: async ({ timeZone }) => {
    const tz = timeZone || 'Europe/Berlin';
    const d = new Date().toLocaleDateString('de-DE', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return ok(d);
  },
};
