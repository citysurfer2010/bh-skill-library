const { safe } = require('../../lib/library.js');
const library = require('./shared.js');
module.exports = { name: 'list_topics', description: 'Lists all processes and agreements of the BH platform with title and summary.', inputSchema: { type: 'object', properties: {} }, handler: safe(() => library.list()) };
