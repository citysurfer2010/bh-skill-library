'use strict';
const { upcoming } = require('../../lib/work.js');
module.exports = { name: 'upcoming', description: 'One-off appointments of the next 7 days from the owner\'s work calendar, without series, blockers, free slots or declined invitations. Read-only.', inputSchema: { type: 'object', properties: {} },
  handler: async () => { try { return { content: [{ type: 'text', text: JSON.stringify(await upcoming()) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
