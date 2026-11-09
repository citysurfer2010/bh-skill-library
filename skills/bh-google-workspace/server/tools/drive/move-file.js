'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'drive_move_file', description: 'Moves a file to another Google Drive folder.', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, newParentId: { type: 'string' }, oldParentId: { type: 'string' }, driveId: { type: 'string' } }, required: ['fileId', 'newParentId', 'oldParentId', 'driveId'] },
  handler: async ({ fileId, newParentId, oldParentId, driveId }) => {
  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&addParents=${newParentId}`;
  if (oldParentId) url += `&removeParents=${oldParentId}`;
  if (driveId) url += `&corpora=drive&driveId=${driveId}`;
  const r = await gapiJSON('PATCH', url, {});
  if (r.status !== 200) return apiErr('drive_move_file', r.status, r.data);
  return ok(`Datei ${fileId} verschoben nach ${newParentId}.`);},
};
