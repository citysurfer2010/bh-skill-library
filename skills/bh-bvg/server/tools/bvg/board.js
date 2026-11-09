'use strict';
const { board } = require('../../lib/bvg.js');
module.exports = { name: 'board', description: 'Departure board at Amtsgerichtsplatz for the way to school; in the morning only westbound to the Herder-Gymnasium.', inputSchema: { type: 'object', properties: {} },
  handler: async () => { try { return { content: [{ type: 'text', text: JSON.stringify(await board()) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
