const { guarded } = require('../../lib/remote.js');
const { showUrl } = require('../../lib/screen.js');
module.exports = { name: 'show_url', description: 'Oeffnet eine https-Seite im Browser des Beamers.', inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } },
  handler: guarded(async ({ url }) => ((await showUrl(url)) === 'app' ? 'Seite wird in BH Screen geoeffnet.' : 'Nur der Samsung-Browser wurde gestartet; die Adresse laedt er nicht von selbst. BH Screen ist noch nicht installiert.')) };
