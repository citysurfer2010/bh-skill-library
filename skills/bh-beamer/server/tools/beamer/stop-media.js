const { guarded } = require('../../lib/remote.js');
const { stop } = require('../../lib/dlna.js');
module.exports = { name: 'stop_media', description: 'Beendet die Stream-Wiedergabe auf dem Beamer.', inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => { await stop(); return 'Wiedergabe beendet.'; }) };
