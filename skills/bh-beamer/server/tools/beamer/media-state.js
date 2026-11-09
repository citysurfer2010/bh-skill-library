const { guarded } = require('../../lib/remote.js');
const { state } = require('../../lib/dlna.js');
module.exports = { name: 'media_state', description: 'Shows the state of stream playback.', inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => ({ state: await state() })) };
