const { guarded } = require('../../lib/remote.js');
const { play } = require('../../lib/dlna.js');
module.exports = { name: 'play_media', description: 'Spielt einen Stream per DLNA auf dem Beamer ab: Video, Radio/Musik (mp3- oder aac-Stream, z. B. ein Radiosender) oder Bild. Die Adresse muss eine direkte Medienadresse sein, die der Beamer erreicht. Fuer YouTube play_youtube nutzen.',
  inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string', enum: ['video', 'audio', 'image'], description: 'Medienart, Standard video; audio fuer Radio und Musik' } } },
  handler: guarded(async ({ url, title, kind }) => { await play(url, title, kind || 'video'); return kind === 'audio' ? 'Wiedergabe gestartet (Audio).' : 'Wiedergabe gestartet.'; }) };
