'use strict';
const { ID_HINT } = require('../../lib/config.js');
const { DRIVE_FIELDS, driveCorpora, formatDriveFile } = require('../../lib/drive-helpers.js');
const { apiErr, gapiJSON, ok, okJson } = require('../../lib/gapi.js');
const { toBlockSet, dropBlocked } = require('../../lib/protected-drives.js');

module.exports = { name: 'drive.findFolder', description: 'Finds a folder in Google Drive by name.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, driveId: { type: 'string' }, parentId: { type: 'string' }, format: { type: 'string', enum: ['text', 'json'], description: 'json returns {query,folders} instead of text' } }, required: ['name'] },
  handler: async ({ name, driveId, parentId, format, _blockProtectedDrives }) => {
  let q = `mimeType='application/vnd.google-apps.folder' and name contains '${name.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(DRIVE_FIELDS)}&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true${driveCorpora(driveId)}`;
  const r = await gapiJSON('GET', url);
  if (r.status !== 200) return apiErr('drive.findFolder', r.status, r.data);
  const folders = dropBlocked(r.data.files || [], toBlockSet(_blockProtectedDrives));
  if (format === 'json') return okJson({ query: name, parentId: parentId || null, driveId: driveId || null, folders });
  if (!folders.length) return ok(`Kein Ordner "${name}" gefunden.`);
  return ok(`${folders.length} Ordner:\n${ID_HINT}\n${folders.map(formatDriveFile).join('\n\n')}`);},
};
