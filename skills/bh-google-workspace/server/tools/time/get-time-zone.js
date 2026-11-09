'use strict';
const { ok } = require('../../lib/gapi.js');

module.exports = {
  name: 'time.getTimeZone',
  description: 'Returns the currently configured system time zone.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => ok(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'),
};
