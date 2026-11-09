'use strict';
const { board } = require('../../lib/bvg.js');
module.exports = { name: 'board', description: 'Abfahrtstafel am Amtsgerichtsplatz für den Schulweg; morgens nur Richtung Westen zum Herder-Gymnasium.', inputSchema: { type: 'object', properties: {} },
  handler: async () => { try { return { content: [{ type: 'text', text: JSON.stringify(await board()) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
