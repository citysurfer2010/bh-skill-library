const { guarded } = require('../../../../bh-nas/server/lib/dsm.js');
const { step } = require('../../lib/photo-sync.js');
module.exports = { name: 'upload_step', description: 'Uploads one downloaded iCloud photo to the fixed Synology folder, never overwriting. Returns only counts.', inputSchema: { type: 'object', properties: {} }, handler: guarded(step) };
