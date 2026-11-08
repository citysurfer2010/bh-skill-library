const { guarded, status } = require('../../lib/remote.js');
module.exports = { name: 'status', description: 'Zeigt, ob der Beamer erreichbar ist, mit Name, Modell und Betriebszustand.', inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => { const d = (await status()).device || {}; return { name: d.name, modell: d.modelName, zustand: d.PowerState }; }) };
