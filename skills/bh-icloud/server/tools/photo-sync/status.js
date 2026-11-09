const { guarded } = require('../../../../bh-nas/server/lib/dsm.js');
const { counts } = require('../../lib/photo-sync.js');
module.exports = { name: 'status', description: 'Shows the progress of the iCloud photo upload as counts.', inputSchema: { type: 'object', properties: {} }, handler: guarded(async () => counts()) };
