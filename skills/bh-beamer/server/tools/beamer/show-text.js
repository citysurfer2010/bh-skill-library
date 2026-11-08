const { guarded } = require('../../lib/remote.js');
const { showText } = require('../../lib/screen.js');
module.exports = { name: 'show_text', description: 'Zeigt Text gross auf dem Beamer an. Ist die Anzeige schon offen, aendert sich der Text nach wenigen Sekunden.',
  inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string', description: 'Grosse Zeile' }, text: { type: 'string', description: 'Optionale zweite Zeile' } } },
  handler: guarded(async ({ title, text = '' }) => { await showText(title, text); return 'Wird auf dem Beamer angezeigt.'; }) };
