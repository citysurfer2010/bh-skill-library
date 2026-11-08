const { guarded } = require('../../lib/remote.js');
const { showHome } = require('../../lib/screen.js');
module.exports = { name: 'home', description: 'Zeigt auf dem Beamer das Startbild mit Uhr, Wetter und Menü.', inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => { await showHome(); return 'Startbild wird gezeigt.'; }) };
