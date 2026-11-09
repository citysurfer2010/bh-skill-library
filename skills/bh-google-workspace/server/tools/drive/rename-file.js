'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

// In-place rename: changes ONLY the name of an existing file (PATCH name).
// File ID, parents, version history and shares are preserved — unlike
// re-upload+delete. Also works for "Contributor" accounts, which may not
// hard-delete on Shared Drives (a metadata update is allowed).
module.exports = { name: 'drive_rename_file', description: 'Renames a file in Google Drive (in place, file ID stays).', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, name: { type: 'string' } }, required: ['fileId', 'name'] },
  handler: async ({ fileId, name }) => {
  const r = await gapiJSON('PATCH', `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, { name });
  if (r.status !== 200) return apiErr('drive_rename_file', r.status, r.data);
  return ok(JSON.stringify({ id: r.data.id, name: r.data.name }));},
};
