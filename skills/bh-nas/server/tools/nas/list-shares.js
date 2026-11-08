const { call, guarded } = require('../../lib/dsm.js');
module.exports = { name: 'list_shares', description: 'Listet die Hauptordner der Synology, die das eigene Konto sehen darf.', inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => (await call('SYNO.FileStation.List', 2, 'list_share')).shares.map((s) => ({ name: s.name, path: s.path }))) };
