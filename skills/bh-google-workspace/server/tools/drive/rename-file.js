'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

// In-Place-Rename: aendert NUR den Namen einer bestehenden Datei (PATCH name).
// Datei-ID, Parents, Versionshistorie und Freigaben bleiben erhalten — anders
// als re-upload+delete. Funktioniert auch fuer "Contributor"-Konten, die auf
// Shared Drives nicht hart loeschen duerfen (Metadaten-Update ist erlaubt).
module.exports = { name: 'drive_rename_file', description: 'Benennt eine Datei in Google Drive um (in-place, Datei-ID bleibt).', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, name: { type: 'string' } }, required: ['fileId', 'name'] },
  handler: async ({ fileId, name }) => {
  const r = await gapiJSON('PATCH', `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, { name });
  if (r.status !== 200) return apiErr('drive_rename_file', r.status, r.data);
  return ok(JSON.stringify({ id: r.data.id, name: r.data.name }));},
};
