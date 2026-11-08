'use strict';
const { ID_HINT } = require('../../lib/config.js');
const { DRIVE_FIELDS, driveCorpora, formatDriveFile } = require('../../lib/drive-helpers.js');
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');
const { toBlockSet, dropBlocked } = require('../../lib/protected-drives.js');

// Freitext vs. Drive-Query-Syntax: Modelle schicken regelmaessig einfachen
// Suchtext ("Orgis", "Angebot Falttuer Oberdorfstrasse") — die Drive-API
// antwortet darauf mit "400 Invalid Value" (34x in der Woche bis 29.08.,
// Wochenreport). Ohne einen der Query-Operatoren wird der Text deshalb
// automatisch in eine gueltige Query uebersetzt statt den 400 durchzureichen.
const QUERY_OPERATOR = /\b(contains|in\s+parents|mimeType|trashed|fullText|modifiedTime|createdTime|starred|sharedWithMe|visibility|properties)\b|[<>=]/;
function toDriveQuery(query) {
  const q = String(query || '').trim();
  if (QUERY_OPERATOR.test(q)) return q;                       // echte Query — unangetastet
  const esc = q.replace(/\\/g, '\\\\').replace(/'/g, "\\'");  // ' und \ fuer den Drive-Parser escapen
  return `(name contains '${esc}' or fullText contains '${esc}') and trashed=false`;
}

module.exports = { name: 'drive.search', description: 'Durchsucht Google Drive nach Dateien. query akzeptiert BEIDES: einfachen Suchtext (wird automatisch als Name-/Volltextsuche ausgeführt) ODER echte Drive-Query-Syntax (name contains \'…\', fullText contains \'…\', mimeType=…, \'<id>\' in parents …).', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Suchtext ODER Drive-Suchquery' }, driveId: { type: 'string', description: 'Shared Drive ID (optional)' }, pageSize: { type: 'number' } }, required: ['query'] },
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
