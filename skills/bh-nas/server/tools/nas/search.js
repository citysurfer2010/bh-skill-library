const { call, checkPath, guarded } = require('../../lib/dsm.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = { name: 'search', description: 'Sucht Dateien und Ordner per Namensmuster unterhalb eines Ordners, z. B. *.pdf.',
  inputSchema: { type: 'object', required: ['path', 'pattern'], properties: { path: { type: 'string' }, pattern: { type: 'string' }, limit: { type: 'number', description: 'Standard 100' } } },
  handler: guarded(async ({ path, pattern, limit = 100 }) => {
    const { taskid } = await call('SYNO.FileStation.Search', 2, 'start', { folder_path: JSON.stringify([checkPath(path)]), pattern: String(pattern), recursive: 'true' });
    try {
      for (let i = 0; ; i++) {
        const d = await call('SYNO.FileStation.Search', 2, 'list', { taskid: JSON.stringify(taskid), offset: '0', limit: String(Math.min(limit, 500)) });
        if (d.finished || i >= 20) return { total: d.total, vollstaendig: !!d.finished, files: d.files.map((f) => ({ name: f.name, path: f.path, ordner: f.isdir })) };
        await sleep(1000);
      }
    } finally {
      await call('SYNO.FileStation.Search', 2, 'stop', { taskid: JSON.stringify([taskid]) }).catch(() => {});
      await call('SYNO.FileStation.Search', 2, 'clean', { taskid: JSON.stringify([taskid]) }).catch(() => {});
    }
  }) };
