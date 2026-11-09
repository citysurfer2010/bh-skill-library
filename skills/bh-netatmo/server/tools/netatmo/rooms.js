'use strict';
const { rooms } = require('../../lib/netatmo.js');
module.exports = { name: 'rooms', description: 'Temperatur, Solltemperatur, Heizbetrieb, offene Fenster und schwache Batterien je Raum. Nur lesend, Werte höchstens 5 Minuten alt.', inputSchema: { type: 'object', properties: {} },
  handler: async () => { try { return { content: [{ type: 'text', text: JSON.stringify(await rooms()) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
