const { guarded } = require('../../lib/remote.js');
const { showHome } = require('../../lib/screen.js');
module.exports = { name: 'home', description: 'Shows the start screen with clock, weather and menu on the Beamer.', inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => { await showHome(); return 'Startbild wird gezeigt.'; }) };
