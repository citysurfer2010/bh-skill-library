'use strict';
const { days } = require('../../lib/webuntis.js');
module.exports = { name: 'days', description: 'Stundenpläne und offene Hausaufgaben der Kinder für die nächsten Schultage, immer frisch abgerufen.',
  inputSchema: { type: 'object', properties: { count: { type: 'number', description: 'Anzahl Schultage, Standard 5, höchstens 10' } } },
  handler: async ({ count } = {}) => {
    try { return { content: [{ type: 'text', text: JSON.stringify(await days(count)) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; }
  } };
