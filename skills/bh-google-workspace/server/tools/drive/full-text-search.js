'use strict';
const { ID_HINT } = require('../../lib/config.js');
const { DRIVE_FIELDS, driveCorpora, formatDriveFile } = require('../../lib/drive-helpers.js');
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');
const { toBlockSet, dropBlocked } = require('../../lib/protected-drives.js');

module.exports = { name: 'drive.fullTextSearch', description: 'Volltextsuche in Google Drive (fullText contains).', inputSchema: { type: 'object', properties: { query: { type: 'string' }, pageSize: { type: 'number', description: 'Default 50' } }, required: ['query'] },
  handler: async ({ query, pageSize = 50, _blockProtectedDrives }) => {
  if (!query) return apiErr('drive.fullTextSearch', 400, 'query fehlt');
  const q = `fullText contains '${query.replace(/'/g, "\\'")}' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(DRIVE_FIELDS)}&pageSize=${pageSize}&supportsAllDrives=true&includeItemsFromAllDrives=true${driveCorpora()}`;
  const r = await gapiJSON('GET', url);
  if (r.status !== 200) return apiErr('drive.fullTextSearch', r.status, r.data);
  const files = dropBlocked(r.data.files || [], toBlockSet(_blockProtectedDrives));
  if (!files.length) return ok(`Keine Treffer für "${query}".`);
  return ok(`${files.length} Datei(en) zu "${query}":\n${ID_HINT}\n${files.map(formatDriveFile).join('\n\n')}`);},
};
