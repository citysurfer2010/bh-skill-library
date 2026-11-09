'use strict';
const { stops } = require('../../lib/bvg.js');
module.exports = { name: 'stops', description: 'Searches BVG stops by name.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } },
  handler: async ({ query }) => { try { return { content: [{ type: 'text', text: JSON.stringify(await stops(query)) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
