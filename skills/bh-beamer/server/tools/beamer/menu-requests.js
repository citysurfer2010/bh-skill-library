const { guarded } = require('../../lib/remote.js');
const { menuRequests } = require('../../lib/screen.js');
module.exports = { name: 'menu_requests', description: 'Holt, was mit der Fernbedienung im Menü gewählt wurde.', inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => JSON.stringify(await menuRequests())) };
