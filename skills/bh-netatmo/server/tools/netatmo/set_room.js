'use strict';
const { setRoom } = require('../../lib/netatmo.js');
module.exports = { name: 'set_room', description: 'Sets the target temperature of a room for a limited time or returns it to the heating schedule. Controls the real heating.',
  inputSchema: { type: 'object', required: ['room'], properties: { room: { type: 'string', description: 'Room name or room ID as in netatmo_rooms' }, temp: { type: 'number', description: 'Degrees, 7 to 30 in half steps' }, minutes: { type: 'number', description: 'Duration in minutes; if omitted, the default duration of the account' }, backToPlan: { type: 'boolean', description: 'Back to the heating schedule' } } },
  handler: async (args) => { try { return { content: [{ type: 'text', text: JSON.stringify(await setRoom(args)) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
