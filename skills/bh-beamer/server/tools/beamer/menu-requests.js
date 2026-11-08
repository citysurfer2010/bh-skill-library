const { guarded } = require('../../lib/remote.js');
const { menuRequests } = require('../../lib/screen.js');
module.exports = { name: 'menu_requests', description: 'Holt, was mit der Fernbedienung im Menü gewählt wurde.', inputSchema: { type: 'object', properties: { wait: { type: 'number', description: 'Sekunden auf eine Auswahl warten, höchstens 25' } } },
  handler: guarded(async ({ wait }) => JSON.stringify(await menuRequests(wait))) };
