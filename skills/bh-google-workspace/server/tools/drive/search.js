'use strict';
const { ID_HINT } = require('../../lib/config.js');
const { DRIVE_FIELDS, driveCorpora, formatDriveFile } = require('../../lib/drive-helpers.js');
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');
const { toBlockSet, dropBlocked } = require('../../lib/protected-drives.js');

// Free text vs. Drive query syntax: models regularly send plain
// search text ("Orgis", "Angebot Falttuer Oberdorfstrasse") — the Drive API
// answers with "400 Invalid Value" (34x in the week up to 29.08.,
// weekly report). So without one of the query operators the text is
// automatically translated into a valid query instead of passing on the 400.
const QUERY_OPERATOR = /\b(contains|in\s+parents|mimeType|trashed|fullText|modifiedTime|createdTime|starred|sharedWithMe|visibility|properties)\b|[<>=]/;
function toDriveQuery(query) {
  const q = String(query || '').trim();
  if (QUERY_OPERATOR.test(q)) return q;                       // real query — left untouched
  const esc = q.replace(/\\/g, '\\\\').replace(/'/g, "\\'");  // escape ' and \ for the Drive parser
  return `(name contains '${esc}' or fullText contains '${esc}') and trashed=false`;
}

module.exports = { name: 'drive.search', description: 'Searches Google Drive for files. query accepts BOTH: plain search text (run automatically as a name/full-text search) OR real Drive query syntax (name contains \'…\', fullText contains \'…\', mimeType=…, \'<id>\' in parents …).', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search text OR Drive search query' }, driveId: { type: 'string', description: 'Shared Drive ID (optional)' }, pageSize: { type: 'number' } }, required: ['query'] },
  handler: async ({ query, driveId, pageSize = 20, _blockProtectedDrives }) => {
  const effective = toDriveQuery(query);
  let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(effective)}&fields=${encodeURIComponent(DRIVE_FIELDS)}&pageSize=${pageSize}&supportsAllDrives=true&includeItemsFromAllDrives=true${driveCorpora(driveId)}`;
  const r = await gapiJSON('GET', url);
  if (r.status !== 200) {
    return apiErr('drive.search', r.status,
      `${JSON.stringify(r.data).slice(0, 200)} — Query war: ${effective}. ` +
      `Tipp: einfachen Suchtext ohne Operatoren senden (wird automatisch übersetzt) oder gültige Drive-Syntax (name contains '…').`);
  }
  const files = dropBlocked(r.data.files || [], toBlockSet(_blockProtectedDrives));
  if (!files.length) return ok(`Keine Dateien gefunden (Query: ${effective}).`);
  return ok(`${files.length} Datei(en):\n${ID_HINT}\n${files.map(formatDriveFile).join('\n\n')}`);},
  __test: { toDriveQuery },
};
