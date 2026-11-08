'use strict';
const { day } = require('../../lib/webuntis.js');
module.exports = { name: 'day', description: 'Stundenplan der Kinder für einen Tag, mit Ausfällen und Vertretungen. Ohne Datum der nächste relevante Schultag.',
  inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'JJJJ-MM-TT' } } },
  handler: async ({ date } = {}) => {
    try { return { content: [{ type: 'text', text: JSON.stringify(await day(date)) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; }
  } };
