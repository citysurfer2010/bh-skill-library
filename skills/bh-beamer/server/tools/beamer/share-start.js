const { guarded } = require('../../lib/remote.js');
const { shareStart } = require('../../lib/screen.js');
module.exports = { name: 'share_start', description: 'Passes a WebRTC offer to the BH Home app and brings it to the front. Returns the session ID. Normally operated through the Beamer app.',
  inputSchema: { type: 'object', required: ['offer'], properties: { offer: { type: 'string', description: 'SDP offer including ICE candidates' } } },
  handler: guarded(async ({ offer }) => shareStart(offer)) };
