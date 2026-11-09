const { guarded } = require('../../lib/remote.js');
const { setMenu } = require('../../lib/screen.js');
module.exports = { name: 'menu_set', description: 'Sets stations and moods in the menu on the Beamer.', inputSchema: { type: 'object', required: ['menu'], properties: { menu: { type: 'object' } } },
  handler: guarded(async ({ menu }) => { await setMenu(menu); return 'Menü gesetzt.'; }) };
