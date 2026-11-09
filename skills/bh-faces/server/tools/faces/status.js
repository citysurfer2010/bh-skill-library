const { guarded } = require('../../../../bh-nas/server/lib/dsm.js');
const { counts } = require('../../lib/store.js');
module.exports = { name: 'status', description: 'Shows the progress of the local face index as counts.',
  inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => counts()) };
