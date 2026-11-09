const { safe } = require('../../lib/library.js');
const library = require('./shared.js');
module.exports = { name: 'lookup', description: 'Returns the full text of one BH process or agreement.', inputSchema: { type: 'object', required: ['topic'], properties: { topic: { type: 'string', description: 'Topic id from list_topics' } } }, handler: safe(({ topic }) => library.lookup(topic)) };
