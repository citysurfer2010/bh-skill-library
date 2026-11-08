'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

// Verschiebt eine Datei in den Papierkorb (PATCH trashed=true). Anders als
// drive_delete_file (hartes Loeschen -> auf Shared Drives oft 404, weil das
// Konto nur "Contributor" ist) funktioniert Trashen mit Metadaten-Rechten.
// Wiederherstellbar (~30 Tage).
module.exports = { name: 'drive_trash_file', description: 'Verschiebt eine Datei in den Papierkorb (trashed=true). Wiederherstellbar.', inputSchema: { type: 'object', properties: { fileId: { type: 'string' } }, required: ['fileId'] },
  handler: async ({ fileId }) => {
  const r = await gapiJSON('PATCH', `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, { trashed: true });
  if (r.status !== 200) return apiErr('drive_trash_file', r.status, r.data);
  return ok(JSON.stringify({ id: r.data.id, trashed: true }));},
};
