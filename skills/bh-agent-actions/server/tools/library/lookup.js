const { safe } = require('../../../../bh-business-logic/server/lib/library.js');
const library = require('./shared.js');
module.exports = { name: 'lookup', description: 'Returns the recipe of one action: which MCP tools to call in which order and what needs confirmation.', inputSchema: { type: 'object', required: ['action'], properties: { action: { type: 'string', description: 'Action id from list' } } }, handler: safe(({ action }) => library.lookup(action)) };
