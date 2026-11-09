const { call, guarded } = require('../../lib/dsm.js');
const { summarize } = require('../../lib/health.js');
const optional = (p) => p.catch(() => null);
module.exports = { name: 'health', description: 'Read-only health report of the Synology: storage, disks, temperature, backup jobs, available update, with plain-language warnings. Needs an account with admin rights.',
  inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => {
    const [system, storage, backups, upgrade] = await Promise.all([
      call('SYNO.Core.System', 1, 'info'),
      call('SYNO.Storage.CGI.Storage', 1, 'load_info'),
      optional(call('SYNO.Backup.Task', 1, 'list')),
      optional(call('SYNO.Core.Upgrade.Server', 1, 'check')),
    ]);
    return summarize({ system, storage, backups, upgrade });
  }) };
