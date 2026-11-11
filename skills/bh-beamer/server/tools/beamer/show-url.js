const { guarded } = require('../../lib/remote.js');
const { showUrl } = require('../../lib/screen.js');
module.exports = { name: 'show_url', description: 'Opens an https page in the browser of the Beamer.', inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } },
  handler: guarded(async ({ url }) => ((await showUrl(url)) === 'app' ? 'Seite wird in BH Home geoeffnet.' : 'Nur der Samsung-Browser wurde gestartet; die Adresse laedt er nicht von selbst. BH Home ist noch nicht installiert.')) };
