const { guarded } = require('../../lib/remote.js');
const { playYoutube } = require('../../lib/dial.js');
module.exports = { name: 'play_youtube', description: 'Spielt ein YouTube-Video auf dem Beamer ab (YouTube-Adresse oder Video-Kennung). Startet die YouTube-App des Beamers direkt mit dem Video.',
  inputSchema: { type: 'object', required: ['video'], properties: { video: { type: 'string', description: 'YouTube-Link oder 11-stellige Video-Kennung' } } },
  handler: guarded(async ({ video }) => `YouTube spielt Video ${await playYoutube(video)}.`) };
