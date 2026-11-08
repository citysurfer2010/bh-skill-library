const { guarded } = require('../../lib/remote.js');
const { play } = require('../../lib/dlna.js');
module.exports = { name: 'play_media', description: 'Spielt ein Video oder Bild per Stream auf dem Beamer ab. Die Adresse muss eine direkte Mediendatei sein, die der Beamer erreicht.',
  inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, title: { type: 'string' } } },
  handler: guarded(async ({ url, title }) => { await play(url, title); return 'Wiedergabe gestartet.'; }) };
