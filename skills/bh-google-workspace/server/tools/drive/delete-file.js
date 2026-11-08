'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

// Löscht eine Datei oder einen Ordner in Google Drive.
//   - Default (permanent nicht/false): Papierkorb (PATCH trashed=true) —
//     reversibel (~30 Tage). Sicherer Default.
//   - permanent:true: hartes Löschen (DELETE). Hartes Löschen schlägt auf
//     Shared Drives mit 404/403 fehl, wenn das Konto nur "Contributor" ist
//     (Drive maskiert fehlende Rechte als notFound). Fallback: Papierkorb.
//     Vorfall 2026-06-05: >1000 _test_*-Ordner-Leichen, weil der Test-Cleanup
//     den stillen 404 schluckte.
module.exports = { name: 'drive_delete_file', description: 'Löscht eine Datei oder einen Ordner in Google Drive. Default: Papierkorb (trashed=true, reversibel). permanent:true = hartes Löschen (files.delete) mit Papierkorb-Fallback, falls hartes Löschen auf Shared Drives nicht erlaubt ist.', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, permanent: { type: 'boolean', description: 'true = endgültig löschen (files.delete). Default false = Papierkorb (reversibel).' } }, required: ['fileId'] },
  handler: async ({ fileId, permanent }) => {
  const trash = async (note) => {
    const t = await gapiJSON('PATCH', `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, { trashed: true });
    if (t.status === 200) return ok(JSON.stringify({ fileId, state: 'trashed', ...(note ? { note } : {}) }));
    return apiErr('drive_delete_file', t.status, t.data);
  };
  // Sicherer Default: Papierkorb.
  if (!permanent) return trash();
  // Hartes Löschen mit Papierkorb-Fallback.
  const r = await gapiJSON('DELETE', `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`);
  if (r.status === 204 || r.status === 200) return ok(JSON.stringify({ fileId, state: 'deleted' }));
  if (r.status === 404 || r.status === 403) return trash('hartes Löschen nicht erlaubt (Shared-Drive-Contributor) — stattdessen Papierkorb');
  return apiErr('drive_delete_file', r.status, r.data);},
};
