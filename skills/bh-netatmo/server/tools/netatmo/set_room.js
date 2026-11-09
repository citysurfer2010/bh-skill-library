'use strict';
const { setRoom } = require('../../lib/netatmo.js');
module.exports = { name: 'set_room', description: 'Setzt die Solltemperatur eines Raums für begrenzte Zeit oder gibt ihn an den Heizplan zurück. Steuert die echte Heizung.',
  inputSchema: { type: 'object', required: ['room'], properties: { room: { type: 'string', description: 'Raumname oder Raum-ID wie in netatmo_rooms' }, temp: { type: 'number', description: 'Grad, 7 bis 30 in halben Schritten' }, minutes: { type: 'number', description: 'Dauer in Minuten; ohne Angabe die Standarddauer des Kontos' }, backToPlan: { type: 'boolean', description: 'Zurück zum Heizplan' } } },
  handler: async (args) => { try { return { content: [{ type: 'text', text: JSON.stringify(await setRoom(args)) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
