const { guarded } = require('../../lib/credentials.js');
const { listCalendars } = require('../../lib/calendar.js');
module.exports = { name: 'calendars', description: 'Lists the iCloud calendars of the connected account.',
  inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => (await listCalendars()).filter((c) => c.has_events).map(({ id, name }) => ({ id, name }))) };
