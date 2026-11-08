'use strict';
const { ok } = require('../../lib/gapi.js');

module.exports = {
  name: 'time.getCurrentTime',
  description: 'Gibt die aktuelle Uhrzeit zurück.',
  inputSchema: {
    type: 'object',
    properties: {
      timeZone: { type: 'string' },
    },
  },
  handler: async ({ timeZone }) => {
    const tz = timeZone || 'Europe/Berlin';
    const t  = new Date().toLocaleTimeString('de-DE', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return ok(`${t} (${tz})`);
  },
};
