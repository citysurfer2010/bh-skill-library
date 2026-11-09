const { safe } = require('../../../../bh-business-logic/server/lib/library.js');
const library = require('./shared.js');
module.exports = { name: 'list', description: 'Lists the actions available across the Beamer, phone and terminal, with title, summary and status.', inputSchema: { type: 'object', properties: {} }, handler: safe(() => library.list()) };
