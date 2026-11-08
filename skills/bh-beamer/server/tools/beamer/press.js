const { KEYS, guarded, press } = require('../../lib/remote.js');
module.exports = { name: 'press', description: 'Drueckt eine Taste der Fernbedienung. KEY_POWER schaltet den Beamer aus; nur auf ausdruecklichen Wunsch des Users verwenden.',
  inputSchema: { type: 'object', required: ['key'], properties: { key: { type: 'string', enum: KEYS } } },
  handler: guarded(async ({ key }) => { await press(key); return `Taste ${key} gesendet.`; }) };
