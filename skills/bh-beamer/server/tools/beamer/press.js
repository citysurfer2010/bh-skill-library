const { KEYS, guarded, press } = require('../../lib/remote.js');
module.exports = { name: 'press', description: 'Presses a key on the remote control. KEY_POWER turns the Beamer off; use only on explicit request by the user.',
  inputSchema: { type: 'object', required: ['key'], properties: { key: { type: 'string', enum: KEYS } } },
  handler: guarded(async ({ key }) => { await press(key); return `Taste ${key} gesendet.`; }) };
