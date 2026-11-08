'use strict';
const { apiErr, gapiJSON, ok, okJson } = require('../../lib/gapi.js');

module.exports = { name: 'drive_create_folder', description: 'Erstellt einen neuen Ordner in Google Drive (auch in Shared Drives).', inputSchema: { type: 'object', properties: { name: { type: 'string' }, parentId: { type: 'string' }, format: { type: 'string', enum: ['text', 'json'], description: 'json liefert {id,name,webViewLink,parents,mimeType} statt Text' } }, required: ['name', 'parentId'] },
  handler: async ({ name: folderName, parentId, format }) => {
  const url = 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true'
    + '&fields=' + encodeURIComponent('id,name,mimeType,webViewLink,parents');
  const r = await gapiJSON('POST', url,
    { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] });
  if (r.status !== 200) return apiErr('drive_create_folder', r.status, r.data);
  if (format === 'json') return okJson(r.data);
  return ok(`Ordner erstellt: ${r.data.name}\nID: ${r.data.id}\nLink: https://drive.google.com/drive/folders/${r.data.id}`);},
};
