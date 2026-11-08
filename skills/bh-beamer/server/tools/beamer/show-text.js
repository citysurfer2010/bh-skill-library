const { guarded } = require('../../lib/remote.js');
const { showText } = require('../../lib/screen.js');
module.exports = { name: 'show_text', description: 'Zeigt Text gross als Bild auf dem Beamer an.',
  inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string', description: 'Grosse Zeile' }, text: { type: 'string', description: 'Optionale zweite Zeile' } } },
  handler: guarded(async ({ title, text = '' }) => ((await showText(title, text)) === 'app' ? 'Wird in BH Screen angezeigt.' : 'Wird als Bild per Stream angezeigt.')) };
