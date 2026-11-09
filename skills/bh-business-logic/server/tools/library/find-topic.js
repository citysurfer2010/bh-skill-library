const { safe } = require('../../lib/library.js');
const library = require('./shared.js');
module.exports = { name: 'find_topic', description: 'Searches the BH processes and agreements by keywords. Use it before deciding how something is done on this platform.', inputSchema: { type: 'object', required: ['question'], properties: { question: { type: 'string' } } }, handler: safe(({ question }) => library.find(question)) };
