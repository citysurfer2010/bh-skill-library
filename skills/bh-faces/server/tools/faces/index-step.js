const { guarded } = require('../../../../bh-nas/server/lib/dsm.js');
const { step } = require('../../lib/indexer.js');
module.exports = { name: 'index_step', description: 'Performs one small step of the local face index: reads one album or analyses one picture. Returns only counts.',
  inputSchema: { type: 'object', properties: {} },
  handler: guarded(step) };
