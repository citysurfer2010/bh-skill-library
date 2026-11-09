const { guarded } = require('../../lib/remote.js');
const { stop } = require('../../lib/dlna.js');
module.exports = { name: 'stop_media', description: 'Stops stream playback on the Beamer.', inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => { await stop(); return 'Wiedergabe beendet.'; }) };
