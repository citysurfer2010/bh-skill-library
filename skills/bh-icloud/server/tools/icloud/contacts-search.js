const { guarded, clamp } = require('../../lib/credentials.js');
const { searchContacts } = require('../../lib/contacts.js');
module.exports = { name: 'contacts_search', description: 'Searches iCloud contacts by name, organization, email, address or phone digits.',
  inputSchema: { type: 'object', required: ['query'], properties: {
    query: { type: 'string', description: 'At least 2 characters' },
    limit: { type: 'number', description: 'Default 20, max 100' },
  } },
  handler: guarded(async ({ query, limit }) => searchContacts({ query, limit: clamp(limit, 20, 100) })) };
