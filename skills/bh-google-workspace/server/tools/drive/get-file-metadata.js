'use strict';
const { apiErr, gapiJSON, ok, okJson } = require('../../lib/gapi.js');

module.exports = { name: 'drive_get_file_metadata', description: 'Ruft Metadaten einer Datei oder eines Ordners ab (inkl. Shared Drive ID und Parents).', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, format: { type: 'string', enum: ['text', 'json'], description: 'json liefert das Metadaten-Objekt unverändert (kompakt); text liefert pretty-printed JSON' } }, required: ['fileId'] },
  handler: async ({ fileId, format, _blockProtectedDrives }) => {
  { const { toBlockSet, refuseProtectedFile } = require('../../lib/protected-drives.js'); const _ref = await refuseProtectedFile(fileId, toBlockSet(_blockProtectedDrives)); if (_ref) return _ref; }
  const r = await gapiJSON('GET', `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,parents,driveId,size,webViewLink,modifiedTime&supportsAllDrives=true`);
  if (r.status !== 200) return apiErr('drive_get_file_metadata', r.status, r.data);
  if (format === 'json') return okJson(r.data);
  return ok(JSON.stringify(r.data, null, 2));},
};
