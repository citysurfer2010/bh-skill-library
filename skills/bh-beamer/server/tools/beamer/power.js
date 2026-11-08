const { guarded } = require('../../lib/remote.js');
const { powerOff, powerOn } = require('../../lib/power.js');
module.exports = { name: 'power', description: 'Schaltet den Beamer ein oder aus und prueft, ob er den Zustand wirklich erreicht hat. Nur auf ausdruecklichen Wunsch verwenden.',
  inputSchema: { type: 'object', required: ['state'], properties: { state: { type: 'string', enum: ['on', 'off'] } } },
  handler: guarded(async ({ state }) => {
    if (state !== 'on' && state !== 'off') throw new Error('state muss on oder off sein');
    return state === 'on' ? powerOn() : powerOff();
  }) };
