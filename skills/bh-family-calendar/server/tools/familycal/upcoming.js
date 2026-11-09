'use strict';
const { upcoming } = require('../../lib/events.js');
module.exports = { name: 'upcoming', description: 'One-off events of the next 14 days from the Family calendar, without recurring events. Read-only.', inputSchema: { type: 'object', properties: {} },
  handler: async () => { try { return { content: [{ type: 'text', text: JSON.stringify(await upcoming()) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
