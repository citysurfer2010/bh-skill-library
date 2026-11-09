'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'drive_copy', description: 'Copies a Google Drive file (e.g. a Docs template). Returns the new file ID.', inputSchema: { type: 'object', properties: { fileId: { type: 'string', description: 'ID of the file to copy' }, name: { type: 'string', description: 'Name of the copy (optional)' }, parentId: { type: 'string', description: 'Target folder ID (optional)' } }, required: ['fileId'] },
  handler: async ({ fileId, name, parentId, _blockProtectedDrives }) => {
  { const { toBlockSet, refuseProtectedFile } = require('../../lib/protected-drives.js'); const _b = toBlockSet(_blockProtectedDrives); const _ref = (await refuseProtectedFile(fileId, _b)) || (await refuseProtectedFile(parentId, _b)); if (_ref) return _ref; }
  const body = {};
  if (name) body.name = name;
  if (parentId) body.parents = [parentId];
  const r = await gapiJSON('POST', `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`, body);
  if (r.status !== 200) return apiErr('drive_copy', r.status, r.data);
  return ok(JSON.stringify(r.data, null, 2));},
};
