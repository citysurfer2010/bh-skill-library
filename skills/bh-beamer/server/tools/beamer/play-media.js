const { guarded } = require('../../lib/remote.js');
const { play } = require('../../lib/dlna.js');
module.exports = { name: 'play_media', description: 'Plays a stream on the Beamer via DLNA: video, audio file or image. The address must be a direct media file the Beamer can reach. The Beamer rejects live radio here, use play_radio for that; for YouTube use play_youtube.',
  inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string', enum: ['video', 'audio', 'image'], description: 'Media kind, default video' } } },
  handler: guarded(async ({ url, title, kind }) => { await play(url, title, kind || 'video'); return kind === 'audio' ? 'Wiedergabe gestartet (Audio).' : 'Wiedergabe gestartet.'; }) };
