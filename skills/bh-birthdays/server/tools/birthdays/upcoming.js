'use strict';
const b = require('../../lib/birthdays.js');
const out = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v) }] });
module.exports = { name: 'upcoming', description: 'Wer in den nächsten 7 Tagen Geburtstag hat: Vorname, Abstand in Tagen, neues Alter.', inputSchema: { type: 'object', properties: {} }, handler: async () => out(b.upcoming()) };
