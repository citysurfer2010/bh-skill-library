'use strict';
const b = require('../../lib/birthdays.js');
const out = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v) }] });
module.exports = { name: 'remove', description: 'Removes a birthday.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Full name as in the list' } }, required: ['name'] }, handler: async ({ name }) => { b.remove(name); return out({ ok: true }); } };
