const { call, guarded } = require('../../lib/dsm.js');
module.exports = { name: 'list_shares', description: 'Lists the top-level Synology folders your own account may see.', inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => (await call('SYNO.FileStation.List', 2, 'list_share')).shares.map((s) => ({ name: s.name, path: s.path }))) };
