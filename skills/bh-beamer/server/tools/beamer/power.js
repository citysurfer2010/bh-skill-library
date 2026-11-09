const { guarded } = require('../../lib/remote.js');
const { powerOff, powerOn } = require('../../lib/power.js');
module.exports = { name: 'power', description: 'Turns the Beamer on or off and checks whether it really reached that state. Use only on explicit request.',
  inputSchema: { type: 'object', required: ['state'], properties: { state: { type: 'string', enum: ['on', 'off'] } } },
  handler: guarded(async ({ state }) => {
    if (state !== 'on' && state !== 'off') throw new Error('state muss on oder off sein');
    return state === 'on' ? powerOn() : powerOff();
  }) };
