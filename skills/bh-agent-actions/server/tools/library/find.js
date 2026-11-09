const { safe } = require('../../../../bh-business-logic/server/lib/library.js');
const library = require('./shared.js');
module.exports = { name: 'find', description: 'Finds the action for a request in plain language. Use it first when a user asks for something to be done.', inputSchema: { type: 'object', required: ['question'], properties: { question: { type: 'string' } } }, handler: safe(({ question }) => library.find(question)) };
