'use strict';
const { alerts } = require('../../lib/bvg.js');
module.exports = { name: 'alerts', description: 'Aktuelle Ausfälle und Störungen auf dem Schulweg (M49), der Ringbahn an Messe Nord und der Stadtbahn ab Charlottenburg.', inputSchema: { type: 'object', properties: {} },
  handler: async () => { try { return { content: [{ type: 'text', text: JSON.stringify(await alerts()) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
