'use strict';
const b = require('../../lib/birthdays.js');
const out = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v) }] });
module.exports = { name: 'set', description: 'Trägt einen Geburtstag ein oder ändert ihn.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Voller Name' }, date: { type: 'string', description: 'Geburtsdatum als JJJJ-MM-TT' } }, required: ['name', 'date'] },
  handler: async ({ name, date }) => { const saved = b.add(name, date); if (!saved) return { content: [{ type: 'text', text: 'Name und Datum (JJJJ-MM-TT) nötig' }], isError: true }; return out(saved); } };
