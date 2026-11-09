const { guarded } = require('../../lib/remote.js');
const { shareAnswer } = require('../../lib/screen.js');
module.exports = { name: 'share_answer', description: 'Fetches the Beamer WebRTC answer for a session; empty until it has arrived.',
  inputSchema: { type: 'object', required: ['session'], properties: { session: { type: 'string' } } },
  handler: guarded(async ({ session }) => shareAnswer(session)) };
