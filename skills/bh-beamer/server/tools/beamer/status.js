const { guarded, status } = require('../../lib/remote.js');
module.exports = { name: 'status', description: 'Shows whether the Beamer is reachable, with name, model and power state.', inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => { const d = (await status()).device || {}; return { name: d.name, model: d.modelName, powerState: d.PowerState }; }) };
