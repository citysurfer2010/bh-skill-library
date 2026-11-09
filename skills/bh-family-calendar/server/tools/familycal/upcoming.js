'use strict';
const { upcoming } = require('../../lib/events.js');
module.exports = { name: 'upcoming', description: 'Einmalige Termine der nächsten 14 Tage aus dem Family-Kalender, ohne Serientermine. Nur lesend.', inputSchema: { type: 'object', properties: {} },
  handler: async () => { try { return { content: [{ type: 'text', text: JSON.stringify(await upcoming()) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
