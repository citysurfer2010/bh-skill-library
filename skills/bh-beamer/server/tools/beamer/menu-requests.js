const { guarded } = require('../../lib/remote.js');
const { menuRequests } = require('../../lib/screen.js');
module.exports = { name: 'menu_requests', description: 'Fetches what was selected in the menu with the remote control.', inputSchema: { type: 'object', properties: { wait: { type: 'number', description: 'Seconds to wait for a selection, at most 25' } } },
  handler: guarded(async ({ wait }) => JSON.stringify(await menuRequests(wait))) };
