'use strict';
const { departures } = require('../../lib/bvg.js');
module.exports = { name: 'departures', description: 'Nächste Abfahrten einer BVG-Haltestelle mit Verspätung und Ausfällen.', inputSchema: { type: 'object', required: ['stop'], properties: { stop: { type: 'string', description: 'Haltestellen-Kennung, z. B. 900024104' }, minutes: { type: 'number' }, results: { type: 'number' } } },
  handler: async ({ stop, minutes, results }) => { try { return { content: [{ type: 'text', text: JSON.stringify(await departures(stop, { minutes, results })) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
