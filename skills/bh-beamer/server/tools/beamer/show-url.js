const { guarded, launchBrowser } = require('../../lib/remote.js');
const { httpsUrl } = require('../../lib/screen.js');
module.exports = { name: 'show_url', description: 'Oeffnet eine https-Seite im Browser des Beamers.', inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } },
  handler: guarded(async ({ url }) => { await launchBrowser(httpsUrl(url)); return 'Browser gestartet. Ob der Beamer die Adresse laedt, meldet er nicht; bitte den User fragen.'; }) };
