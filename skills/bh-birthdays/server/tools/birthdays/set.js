'use strict';
const b = require('../../lib/birthdays.js');
const out = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v) }] });
module.exports = { name: 'set', description: 'Adds or changes a birthday.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Full name' }, date: { type: 'string', description: 'Date of birth as YYYY-MM-DD' } }, required: ['name', 'date'] },
  handler: async ({ name, date }) => { const saved = b.add(name, date); if (!saved) return { content: [{ type: 'text', text: 'Name und Datum (JJJJ-MM-TT) nötig' }], isError: true }; return out(saved); } };
