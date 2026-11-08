'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'drive_copy', description: 'Kopiert eine Google Drive Datei (z.B. Docs-Template). Gibt die neue Datei-ID zurück.', inputSchema: { type: 'object', properties: { fileId: { type: 'string', description: 'ID der zu kopierenden Datei' }, name: { type: 'string', description: 'Name der Kopie (optional)' }, parentId: { type: 'string', description: 'Zielordner-ID (optional)' } }, required: ['fileId'] },
  handler: async ({ fileId, name, parentId, _blockProtectedDrives }) => {
  { const { toBlockSet, refuseProtectedFile } = require('../../lib/protected-drives.js'); const _b = toBlockSet(_blockProtectedDrives); const _ref = (await refuseProtectedFile(fileId, _b)) || (await refuseProtectedFile(parentId, _b)); if (_ref) return _ref; }
  const body = {};
  if (name) body.name = name;
  if (parentId) body.parents = [parentId];
  const r = await gapiJSON('POST', `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`, body);
  if (r.status !== 200) return apiErr('drive_copy', r.status, r.data);
  return ok(JSON.stringify(r.data, null, 2));},
};
