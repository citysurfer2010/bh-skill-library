const { guarded } = require('../../lib/remote.js');
const { playAmbient } = require('../../lib/screen.js');
module.exports = { name: 'play_ambient', description: 'Plays an ambience video in the BH Screen app, optionally with radio. The Back key returns to the start screen.',
  inputSchema: { type: 'object', required: ['video'], properties: { video: { type: 'string', description: 'YouTube ID, 11 characters' }, title: { type: 'string' }, radio_url: { type: 'string' }, station: { type: 'string' } } },
  handler: guarded(async ({ video, title, radio_url: radioUrl, station }) => { await playAmbient({ video, title, radioUrl, station }); return `${title || 'Video'} läuft in BH Screen.`; }) };
