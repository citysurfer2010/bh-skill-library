const { guarded } = require('../../lib/remote.js');
const { playRadio } = require('../../lib/screen.js');
module.exports = { name: 'play_radio', description: 'Spielt einen Radiosender oder Musik-Stream in der App BH Screen ab (https-Adresse eines mp3- oder aac-Streams).',
  inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, title: { type: 'string', description: 'Name des Senders fuer die Anzeige' } } },
  handler: guarded(async ({ url, title = 'Radio' }) => { await playRadio(url, title); return `${title} wird in BH Screen abgespielt.`; }) };
