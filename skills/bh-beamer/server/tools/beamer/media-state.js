const { guarded } = require('../../lib/remote.js');
const { state } = require('../../lib/dlna.js');
module.exports = { name: 'media_state', description: 'Zeigt den Zustand der Stream-Wiedergabe.', inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => ({ zustand: await state() })) };
