'use strict';
const b = require('../../lib/birthdays.js');
const out = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v) }] });
module.exports = { name: 'remove', description: 'Entfernt einen Geburtstag.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Voller Name wie in der Liste' } }, required: ['name'] }, handler: async ({ name }) => { b.remove(name); return out({ ok: true }); } };
