'use strict';
const b = require('../../lib/birthdays.js');
const out = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v) }] });
module.exports = { name: 'upcoming', description: 'Who has a birthday in the next 7 days: first name, days away, new age.', inputSchema: { type: 'object', properties: {} }, handler: async () => out(b.upcoming()) };
