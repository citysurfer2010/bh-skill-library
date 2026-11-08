const { guarded } = require('../../lib/remote.js');
const { play } = require('../../lib/dlna.js');
module.exports = { name: 'play_media', description: 'Spielt einen Stream per DLNA auf dem Beamer ab: Video, Audiodatei oder Bild. Die Adresse muss eine direkte Mediendatei sein, die der Beamer erreicht. Live-Radio lehnt der Beamer hier ab, dafuer play_radio; fuer YouTube play_youtube.',
  inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string', enum: ['video', 'audio', 'image'], description: 'Medienart, Standard video' } } },
  handler: guarded(async ({ url, title, kind }) => { await play(url, title, kind || 'video'); return kind === 'audio' ? 'Wiedergabe gestartet (Audio).' : 'Wiedergabe gestartet.'; }) };
