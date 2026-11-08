const { guarded } = require('../../lib/remote.js');
const { shareAnswer } = require('../../lib/screen.js');
module.exports = { name: 'share_answer', description: 'Holt die WebRTC-Antwort des Beamers zu einer Sitzung; leer, solange sie noch nicht da ist.',
  inputSchema: { type: 'object', required: ['session'], properties: { session: { type: 'string' } } },
  handler: guarded(async ({ session }) => shareAnswer(session)) };
