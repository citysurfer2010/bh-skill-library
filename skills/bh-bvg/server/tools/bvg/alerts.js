'use strict';
const { alerts } = require('../../lib/bvg.js');
module.exports = { name: 'alerts', description: 'Current cancellations and disruptions on the way to school (M49), the Ringbahn at Messe Nord and the Stadtbahn from Charlottenburg.', inputSchema: { type: 'object', properties: {} },
  handler: async () => { try { return { content: [{ type: 'text', text: JSON.stringify(await alerts()) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
