const { guarded } = require('../../lib/remote.js');
const { playRadio } = require('../../lib/screen.js');
module.exports = { name: 'play_radio', description: 'Plays a radio station or music stream in the BH Screen app (https address of an mp3 or aac stream).',
  inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, title: { type: 'string', description: 'Station name for the display' } } },
  handler: guarded(async ({ url, title = 'Radio' }) => { await playRadio(url, title); return `${title} wird in BH Screen abgespielt.`; }) };
