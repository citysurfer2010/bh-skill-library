'use strict';
const b = require('../../lib/birthdays.js');
const out = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v) }] });
module.exports = { name: 'list', description: 'Alle eingetragenen Geburtstage der Familie mit vollem Datum.', inputSchema: { type: 'object', properties: {} }, handler: async () => out(b.load()) };
