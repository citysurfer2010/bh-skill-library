'use strict';
const { apiErr, gapiJSON, ok, okJson } = require('../../lib/gapi.js');
const { toBlockSet, dropBlocked } = require('../../lib/protected-drives.js');

module.exports = { name: 'drive_list_folder', description: 'Lists the contents of a Google Drive folder by ID. Also in Shared Drives (driveId recommended).', inputSchema: { type: 'object', properties: { folderId: { type: 'string', description: 'ID of the folder' }, driveId: { type: 'string', description: 'ID of the Shared Drive (optional but recommended)' }, pageSize: { type: 'number' }, orderBy: { type: 'string' }, pageToken: { type: 'string', description: 'Pagination token from previous response' }, format: { type: 'string', enum: ['text', 'json'], description: 'json returns {folderId,files,nextPageToken} instead of text' } }, required: ['folderId'] },
  handler: async ({ folderId, driveId, pageSize = 100, orderBy = 'name', pageToken, format, _blockProtectedDrives }) => {
  const base = driveId
    ? `driveId=${driveId}&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=drive`
    : 'supportsAllDrives=true&includeItemsFromAllDrives=true';
  const url = `https://www.googleapis.com/drive/v3/files?`
    + `q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}`
    + `&pageSize=${pageSize}&orderBy=${encodeURIComponent(orderBy)}`
    + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '')
    + `&fields=nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,lastModifyingUser(displayName,emailAddress),parents,webViewLink,driveId)&${base}`;
  const r = await gapiJSON('GET', url);
  if (r.status !== 200) return apiErr('drive_list_folder', r.status, r.data);
  const files = dropBlocked(r.data.files || [], toBlockSet(_blockProtectedDrives));
  if (format === 'json') return okJson({ folderId, files, nextPageToken: r.data.nextPageToken || null });
  if (!files.length) return ok('Ordner ist leer.');
  const lines = files.map(f => {
    const icon = f.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄';
    return `${icon} ${f.name}  (${f.id})`;
  }).join('\n');
  // Truncated lists MUST identify themselves as such: text mode
  // swallowed the nextPageToken and reported "460 Einträge" as if that were everything.
  // Anyone basing an existence check on that creates duplicates (incident 2026-09-09,
  // two property folders Koenigsberger Strasse 7a). Endre 2026-09-10.
  const weiter = r.data.nextPageToken
    ? `\n\n⚠ NICHT VOLLSTÄNDIG — es gibt weitere Einträge. Naechste Seite mit`
      + ` pageToken="${r.data.nextPageToken}" holen (oder pageSize erhoehen).`
      + ` Diese Liste NICHT als "existiert nicht"-Beweis verwenden.`
    : '';
  return ok(`${files.length} Einträge in Ordner ${folderId}:\n\n${lines}${weiter}`);},
};
