'use strict';
const { status } = require('../../lib/netatmo.js');
module.exports = { name: 'status', description: 'Rooms plus active heating schedule and special mode such as away. Read-only.', inputSchema: { type: 'object', properties: {} },
  handler: async () => { try { return { content: [{ type: 'text', text: JSON.stringify(await status()) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
