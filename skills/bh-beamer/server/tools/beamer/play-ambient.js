const { guarded } = require('../../lib/remote.js');
const { playAmbient } = require('../../lib/screen.js');
module.exports = { name: 'play_ambient', description: 'Spielt ein Stimmungsvideo in der App BH Screen, optional mit Radio dazu. Die Zurück-Taste führt zum Startbild.',
  inputSchema: { type: 'object', required: ['video'], properties: { video: { type: 'string', description: 'YouTube-Kennung, 11 Zeichen' }, title: { type: 'string' }, radio_url: { type: 'string' }, station: { type: 'string' } } },
  handler: guarded(async ({ video, title, radio_url: radioUrl, station }) => { await playAmbient({ video, title, radioUrl, station }); return `${title || 'Video'} läuft in BH Screen.`; }) };
