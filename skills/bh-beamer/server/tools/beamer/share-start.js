const { guarded } = require('../../lib/remote.js');
const { shareStart } = require('../../lib/screen.js');
module.exports = { name: 'share_start', description: 'Gibt ein WebRTC-Angebot an die App BH Screen weiter und holt sie nach vorn. Liefert die Sitzungskennung. Normal bedient ueber die App Beamer.',
  inputSchema: { type: 'object', required: ['offer'], properties: { offer: { type: 'string', description: 'SDP-Angebot inklusive ICE-Kandidaten' } } },
  handler: guarded(async ({ offer }) => shareStart(offer)) };
