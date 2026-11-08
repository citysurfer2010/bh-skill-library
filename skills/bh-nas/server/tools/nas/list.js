const { call, checkPath, guarded } = require('../../lib/dsm.js');
module.exports = { name: 'list', description: 'Listet den Inhalt eines Ordners auf der Synology mit Groesse und Aenderungsdatum.',
  inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string', description: 'Absoluter Pfad, z. B. /Backup' }, offset: { type: 'number' }, limit: { type: 'number', description: 'Standard 200, hoechstens 1000' } } },
  handler: guarded(async ({ path, offset = 0, limit = 200 }) => {
    const d = await call('SYNO.FileStation.List', 2, 'list', { folder_path: checkPath(path), offset: String(offset), limit: String(Math.min(limit, 1000)), additional: JSON.stringify(['size', 'time']) });
    return { total: d.total, offset: d.offset, files: d.files.map((f) => ({ name: f.name, path: f.path, ordner: f.isdir, bytes: f.additional?.size, geaendert: f.additional?.time?.mtime ? new Date(f.additional.time.mtime * 1000).toISOString() : undefined })) };
  }) };
