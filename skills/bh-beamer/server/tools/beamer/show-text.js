const { guarded } = require('../../lib/remote.js');
const { showText } = require('../../lib/screen.js');
module.exports = { name: 'show_text', description: 'Shows text in large type as an image on the Beamer.',
  inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string', description: 'Large line' }, text: { type: 'string', description: 'Optional second line' } } },
  handler: guarded(async ({ title, text = '' }) => ((await showText(title, text)) === 'app' ? 'Wird in BH Home angezeigt.' : 'Wird als Bild per Stream angezeigt.')) };
