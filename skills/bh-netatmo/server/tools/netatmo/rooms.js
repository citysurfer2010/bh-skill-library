'use strict';
const { rooms } = require('../../lib/netatmo.js');
module.exports = { name: 'rooms', description: 'Temperature, target temperature, heating state, open windows and weak batteries per room. Read-only, values at most 5 minutes old.', inputSchema: { type: 'object', properties: {} },
  handler: async () => { try { return { content: [{ type: 'text', text: JSON.stringify(await rooms()) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
