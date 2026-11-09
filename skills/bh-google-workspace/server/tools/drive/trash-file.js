'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

// Moves a file to the trash (PATCH trashed=true). Unlike
// drive_delete_file (hard delete -> often 404 on Shared Drives because the
// account is only "Contributor") trashing works with metadata rights.
// Recoverable (~30 days).
module.exports = { name: 'drive_trash_file', description: 'Moves a file to the trash (trashed=true). Recoverable.', inputSchema: { type: 'object', properties: { fileId: { type: 'string' } }, required: ['fileId'] },
  handler: async ({ fileId }) => {
  const r = await gapiJSON('PATCH', `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, { trashed: true });
  if (r.status !== 200) return apiErr('drive_trash_file', r.status, r.data);
  return ok(JSON.stringify({ id: r.data.id, trashed: true }));},
};
