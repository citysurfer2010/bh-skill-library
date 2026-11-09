'use strict';
const b = require('../../lib/birthdays.js');
const out = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v) }] });
module.exports = { name: 'list', description: 'All registered family birthdays with full date.', inputSchema: { type: 'object', properties: {} }, handler: async () => out(b.load()) };
