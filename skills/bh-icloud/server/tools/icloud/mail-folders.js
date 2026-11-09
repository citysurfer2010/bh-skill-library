const { guarded } = require('../../lib/credentials.js');
const { listFolders } = require('../../lib/mail.js');
module.exports = { name: 'mail_folders', description: 'Lists the iCloud Mail folders. Use the names exactly as returned.',
  inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => listFolders()) };
