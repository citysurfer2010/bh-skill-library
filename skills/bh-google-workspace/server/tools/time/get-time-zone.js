'use strict';
const { ok } = require('../../lib/gapi.js');

module.exports = {
  name: 'time.getTimeZone',
  description: 'Gibt die aktuell konfigurierte Systemzeitzone zurück.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => ok(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'),
};
