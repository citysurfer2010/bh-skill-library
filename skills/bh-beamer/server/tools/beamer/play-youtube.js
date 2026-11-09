const { guarded } = require('../../lib/remote.js');
const { playYoutube } = require('../../lib/dial.js');
module.exports = { name: 'play_youtube', description: 'Plays a YouTube video on the Beamer (YouTube address or video ID). Starts the Beamer YouTube app directly with the video.',
  inputSchema: { type: 'object', required: ['video'], properties: { video: { type: 'string', description: 'YouTube link or 11-character video ID' } } },
  handler: guarded(async ({ video }) => `YouTube spielt Video ${await playYoutube(video)}.`) };
