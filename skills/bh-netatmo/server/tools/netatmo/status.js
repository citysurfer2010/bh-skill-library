'use strict';
const { status } = require('../../lib/netatmo.js');
module.exports = { name: 'status', description: 'Räume plus aktiver Heizplan und Sondermodus wie Abwesend. Nur lesend.', inputSchema: { type: 'object', properties: {} },
  handler: async () => { try { return { content: [{ type: 'text', text: JSON.stringify(await status()) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
